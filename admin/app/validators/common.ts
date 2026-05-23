import vine from '@vinejs/vine'
import ipaddr from 'ipaddr.js'

/**
 * Checks whether a URL points to a loopback or link-local address.
 * Used to prevent SSRF — the server should not fetch from localhost
 * or link-local/metadata endpoints (e.g. cloud instance metadata at 169.254.x.x).
 *
 * RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x) are intentionally
 * ALLOWED because NOMAD is a LAN appliance and users may host content
 * mirrors on their local network.
 *
 * Throws an error if the URL is a loopback or link-local address.
 */
export function assertNotPrivateUrl(urlString: string): void {
  const parsed = new URL(urlString)
  const hostname = parsed.hostname.toLowerCase()

  // `URL.hostname` strips the surrounding brackets from IPv6 literals
  // (e.g. `http://[::1]/` → hostname `::1`), so IPv6 patterns must match
  // the unbracketed form.
  const blockedPatterns = [
    /^localhost$/,
    /^127\.\d+\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^169\.254\.\d+\.\d+$/, // Link-local / cloud metadata
    /^::1$/, // IPv6 loopback
    /^fe80:/i, // IPv6 link-local
    /^::ffff:/i, // IPv4-mapped IPv6 (e.g. ::ffff:7f00:1 = 127.0.0.1)
    /^::$/, // IPv6 all-zeros (equivalent to 0.0.0.0)
  ]

  if (blockedPatterns.some((re) => re.test(hostname))) {
    throw new Error(`Download URL must not point to a loopback or link-local address: ${hostname}`)
  }
}

/**
 * Narrower SSRF guard for "remote service" URLs the user points NOMAD at
 * (e.g. an OpenAI-compatible endpoint like LM Studio, llama.cpp, vLLM, or a
 * sibling Ollama container). Unlike `assertNotPrivateUrl`, this intentionally
 * ALLOWS loopback, link-local-ish, and RFC1918 hosts because the legitimate
 * target is frequently on the same host or LAN (host.docker.internal,
 * the docker bridge gateway, or a LAN IP).
 *
 * It blocks only:
 *   - the cloud instance-metadata IP (169.254.169.254), to avoid leaking
 *     IAM creds on a misconfigured cloud VM
 *   - non-HTTP schemes (file:, gopher:, etc.)
 */
// Canonical cloud instance-metadata addresses. AWS, GCP, Azure, DigitalOcean,
// Oracle Cloud, and Alibaba all expose IMDS at 169.254.169.254 over IPv4;
// AWS additionally exposes it at fd00:ec2::254 over IPv6.
// Compared after `ipaddr.toNormalizedString()`, which expands IPv6 to its
// fully-zero-padded form (e.g. `fd00:ec2::254` → `fd00:ec2:0:0:0:0:0:254`).
const BLOCKED_METADATA_IPV4 = new Set(['169.254.169.254'])
const BLOCKED_METADATA_IPV6 = new Set([
  ipaddr.parse('fd00:ec2::254').toNormalizedString(),
])

export function assertNotCloudMetadataUrl(urlString: string): void {
  const parsed = new URL(urlString)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL must use http or https scheme: ${parsed.protocol}`)
  }

  // Node's WHATWG URL parser keeps the brackets on IPv6 literals
  // (`http://[::1]/` → hostname `[::1]`), so strip them before parsing.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  // If the hostname isn't an IP literal it's a DNS name; allow it. (DNS
  // rebinding is out of scope here — would require resolving and re-checking
  // at fetch time.)
  if (!ipaddr.isValid(hostname)) return

  let addr = ipaddr.parse(hostname)

  // Unwrap IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254, ::ffff:a9fe:a9fe,
  // and the fully-expanded 0:0:0:0:0:ffff:a9fe:a9fe) so the IPv4 check below
  // sees the embedded address.
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address()
  }

  const canonical = addr.toNormalizedString()

  const blocked =
    addr.kind() === 'ipv4' ? BLOCKED_METADATA_IPV4 : BLOCKED_METADATA_IPV6
  if (blocked.has(canonical)) {
    throw new Error(`URL must not point to the cloud instance metadata endpoint: ${canonical}`)
  }
}

export const remoteDownloadValidator = vine.compile(
  vine.object({
    url: vine
      .string()
      .url({ require_tld: false }) // Allow LAN URLs (e.g. http://my-nas:8080/file.zim)
      .trim(),
  })
)

export const remoteDownloadWithMetadataValidator = vine.compile(
  vine.object({
    url: vine
      .string()
      .url({ require_tld: false }) // Allow LAN URLs
      .trim(),
    metadata: vine
      .object({
        title: vine.string().trim().minLength(1),
        summary: vine.string().trim().optional(),
        author: vine.string().trim().optional(),
        size_bytes: vine.number().optional(),
      })
      .optional(),
  })
)

export const remoteDownloadValidatorOptional = vine.compile(
  vine.object({
    url: vine
      .string()
      .url({ require_tld: false }) // Allow LAN URLs
      .trim()
      .optional(),
  })
)

export const filenameParamValidator = vine.compile(
  vine.object({
    params: vine.object({
      filename: vine.string().trim().minLength(1).maxLength(4096),
    }),
  })
)

export const downloadCollectionValidator = vine.compile(
  vine.object({
    slug: vine.string(),
  })
)

export const downloadCategoryTierValidator = vine.compile(
  vine.object({
    categorySlug: vine.string().trim().minLength(1),
    tierSlug: vine.string().trim().minLength(1),
  })
)

export const selectWikipediaValidator = vine.compile(
  vine.object({
    optionId: vine.string().trim().minLength(1),
  })
)

const resourceUpdateInfoBase = vine.object({
  resource_id: vine.string().trim().minLength(1),
  resource_type: vine.enum(['zim', 'map'] as const),
  installed_version: vine.string().trim(),
  latest_version: vine.string().trim().minLength(1),
  download_url: vine.string().url({ require_tld: false }).trim(),
  size_bytes: vine.number().positive().optional(),
})

export const applyContentUpdateValidator = vine.compile(resourceUpdateInfoBase)

export const applyAllContentUpdatesValidator = vine.compile(
  vine.object({
    updates: vine
      .array(resourceUpdateInfoBase)
      .minLength(1),
  })
)

// --- Map extract (regional pmtiles download) ---

// ISO 3166-1 alpha-2, 2 letters. Loose regex; CountriesService.resolveCodes
// does the authoritative check against the polygon dataset.
const countryCodeSchema = vine
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/)

const countriesArraySchema = vine.array(countryCodeSchema).minLength(1).maxLength(300)

export const mapExtractPreflightValidator = vine.compile(
  vine.object({
    countries: countriesArraySchema.clone(),
    maxzoom: vine.number().min(0).max(15).optional(),
  })
)

export const mapExtractValidator = vine.compile(
  vine.object({
    countries: countriesArraySchema.clone(),
    maxzoom: vine.number().min(0).max(15).optional(),
    label: vine.string().trim().minLength(1).maxLength(64).optional(),
    estimatedBytes: vine.number().min(0).optional(),
  })
)
