/**
 * Pure decision logic for picking which host a ZIM download is actually fetched
 * from (#1115).
 *
 * Every curated tier, Wikipedia edition, Easy Setup pick, content update and
 * catalog download resolves to a canonical `download.kiwix.org/zim/...` URL. That
 * host is a redirector, and for the large Wikimedia-family ZIMs it lands on
 * dumps.wikimedia.org, which benchmarked ~9x slower than the fastest mirror from
 * a US box. No single mirror is fastest everywhere, so instead of hardcoding one
 * we measure from the box itself and keep the winner.
 *
 * The canonical URL stays the identity of a download everywhere (job id,
 * InstalledResource.url, Wikipedia selection, retries). Only the bytes come from
 * the mirror, which is why this rewrite is applied at fetch time and nowhere
 * else. Anything that isn't a canonical Kiwix ZIM URL (gated hosted content, a
 * file the user picked while browsing a specific mirror, maps) is left alone.
 *
 * Kept free of Lucid/Adonis imports so it can be unit-tested directly; the I/O
 * lives in ZimMirrorService.
 */

export const CANONICAL_ZIM_HOST = 'download.kiwix.org'
export const CANONICAL_ZIM_BASE_URL = `https://${CANONICAL_ZIM_HOST}/zim/`

/** A measurement younger than this is reused; older ones trigger a re-probe. */
export const MEASUREMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000
/**
 * When every probe failed (offline / air-gapped box, or a flaky moment) we still
 * cache the result, but only briefly. Without the cache an offline box would
 * re-run the probe in front of every queued download.
 */
export const FAILED_MEASUREMENT_TTL_MS = 24 * 60 * 60 * 1000

/** User override stored in KV. Unset is treated as 'auto'. */
export type ZimMirrorOverride = 'auto' | 'canonical' | `${number}`

export type ZimMirrorSource = { id: number; base_url: string }

export type MirrorProbeResult = {
  baseUrl: string
  /** null when the probe failed, timed out before any data, or got a bad status. */
  bytesPerSecond: number | null
}

export type ZimMirrorMeasurement = {
  /** Winning base URL, or null when nothing could be measured. */
  baseUrl: string | null
  measuredAt: string
  results: MirrorProbeResult[]
}

export type ResolvedZimMirror = {
  /** Base URL to rewrite canonical URLs onto, or null to fetch from the canonical host. */
  baseUrl: string | null
  reason: 'override' | 'measured' | 'default'
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function sameBase(a: string, b: string): boolean {
  return withTrailingSlash(a) === withTrailingSlash(b)
}

/**
 * Returns the path below `/zim/` (e.g. `wikipedia/wikipedia_en_all_maxi_2026-01.zim`)
 * when `url` is a canonical Kiwix ZIM URL, otherwise null.
 */
export function canonicalZimRelativePath(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (parsed.hostname !== CANONICAL_ZIM_HOST) return null
  if (!parsed.pathname.startsWith('/zim/') || !parsed.pathname.endsWith('.zim')) return null
  const relative = parsed.pathname.slice('/zim/'.length)
  return relative.length > 0 ? relative : null
}

/**
 * Rewrites a canonical `download.kiwix.org/zim/...` URL onto a mirror base URL
 * (which must point at the mirror's copy of the `zim/` directory, as every
 * built-in source does). Non-canonical URLs and a null base pass through as-is.
 */
export function rewriteZimUrlToMirror(url: string, mirrorBaseUrl: string | null): string {
  if (!mirrorBaseUrl) return url
  const relative = canonicalZimRelativePath(url)
  if (!relative) return url
  try {
    // Validate the base; a malformed stored value must never break a download.
    new URL(mirrorBaseUrl)
  } catch {
    return url
  }
  return withTrailingSlash(mirrorBaseUrl) + relative
}

/**
 * Picks the fastest successfully-probed source. Failed/timed-out probes (null,
 * zero, NaN) are ignored; ties keep the earlier entry, so listing the canonical
 * host first makes it win a tie. Returns null when nothing succeeded.
 */
export function pickFastestMirror(results: MirrorProbeResult[]): string | null {
  let best: MirrorProbeResult | null = null
  for (const r of results) {
    if (r.bytesPerSecond === null || !Number.isFinite(r.bytesPerSecond) || r.bytesPerSecond <= 0) {
      continue
    }
    if (!best || r.bytesPerSecond > best.bytesPerSecond!) best = r
  }
  return best ? best.baseUrl : null
}

/** Defensive parse of the KV-stored measurement; anything malformed reads as "never measured". */
export function parseMirrorMeasurement(
  raw: string | null | undefined
): ZimMirrorMeasurement | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    if (value.baseUrl !== null && typeof value.baseUrl !== 'string') return null
    if (typeof value.measuredAt !== 'string' || Number.isNaN(Date.parse(value.measuredAt)))
      return null
    const results = Array.isArray(value.results)
      ? value.results.filter(
          (r: any) =>
            r &&
            typeof r.baseUrl === 'string' &&
            (r.bytesPerSecond === null || typeof r.bytesPerSecond === 'number')
        )
      : []
    return { baseUrl: value.baseUrl, measuredAt: value.measuredAt, results }
  } catch {
    return null
  }
}

export function isMeasurementFresh(
  measurement: ZimMirrorMeasurement | null,
  nowMs: number
): boolean {
  if (!measurement) return false
  const age = nowMs - Date.parse(measurement.measuredAt)
  if (!Number.isFinite(age) || age < 0) return false
  const ttl = measurement.baseUrl ? MEASUREMENT_TTL_MS : FAILED_MEASUREMENT_TTL_MS
  return age < ttl
}

export function parseMirrorOverride(raw: string | null | undefined): ZimMirrorOverride {
  if (raw === 'canonical') return 'canonical'
  if (raw && /^[1-9]\d*$/.test(raw)) return raw as `${number}`
  return 'auto'
}

/**
 * The one precedence rule every ZIM download follows:
 * user override > measured fastest > canonical default.
 *
 * An override naming a source that no longer exists falls through to the
 * measurement rather than silently pinning downloads to the canonical host.
 */
export function resolveZimMirror(input: {
  override: ZimMirrorOverride
  measurement: ZimMirrorMeasurement | null
  sources: ZimMirrorSource[]
}): ResolvedZimMirror {
  const { override, measurement, sources } = input

  if (override === 'canonical') return { baseUrl: null, reason: 'override' }
  if (override !== 'auto') {
    const source = sources.find((s) => s.id === Number(override))
    if (source) {
      return {
        baseUrl: sameBase(source.base_url, CANONICAL_ZIM_BASE_URL) ? null : source.base_url,
        reason: 'override',
      }
    }
  }

  if (measurement?.baseUrl) {
    return {
      baseUrl: sameBase(measurement.baseUrl, CANONICAL_ZIM_BASE_URL) ? null : measurement.baseUrl,
      reason: 'measured',
    }
  }

  return { baseUrl: null, reason: 'default' }
}
