import vine from '@vinejs/vine'

/**
 * Checks whether a URL points to a private/internal network address.
 * Used to prevent SSRF — the server should not fetch from localhost,
 * private RFC1918 ranges, link-local, or cloud metadata endpoints.
 *
 * Throws an error if the URL is internal/private.
 */
export function assertNotPrivateUrl(urlString: string): void {
  const parsed = new URL(urlString)
  const hostname = parsed.hostname.toLowerCase()

  const privatePatterns = [
    /^localhost$/,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/, // Link-local / cloud metadata
    /^0\.0\.0\.0$/,
    /^\[::1\]$/,
    /^\[?fe80:/i,
    /^\[?fd[0-9a-f]{2}:/i, // Unique local IPv6
  ]

  if (privatePatterns.some((re) => re.test(hostname))) {
    throw new Error(`Download URL must not point to a private/internal address: ${hostname}`)
  }
}

export const remoteDownloadValidator = vine.compile(
  vine.object({
    url: vine
      .string()
      .url()
      .trim(),
  })
)

export const remoteDownloadWithMetadataValidator = vine.compile(
  vine.object({
    url: vine
      .string()
      .url()
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
      .url()
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
  download_url: vine.string().url().trim(),
})

export const applyContentUpdateValidator = vine.compile(resourceUpdateInfoBase)

export const applyAllContentUpdatesValidator = vine.compile(
  vine.object({
    updates: vine
      .array(resourceUpdateInfoBase)
      .minLength(1),
  })
)
