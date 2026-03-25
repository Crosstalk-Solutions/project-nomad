type DownloadMirrorRule = {
  source: string
  target: string
}

let cachedMirrorRulesRaw: string | undefined
let cachedMirrorRules: DownloadMirrorRule[] = []

function normalizeMirrorPrefix(urlString: string): string {
  const parsed = new URL(urlString)
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function joinMirrorUrl(targetPrefix: string, suffix: string): string {
  if (!suffix) return targetPrefix

  if (targetPrefix.endsWith('/') && suffix.startsWith('/')) {
    return `${targetPrefix}${suffix.slice(1)}`
  }

  if (!targetPrefix.endsWith('/') && !suffix.startsWith('/')) {
    return `${targetPrefix}/${suffix}`
  }

  return `${targetPrefix}${suffix}`
}

function normalizeDownloadMirrorRule(source: string, target: string): DownloadMirrorRule {
  const normalizedSource = normalizeMirrorPrefix(source)
  const normalizedTarget = normalizeMirrorPrefix(target)

  return {
    source: normalizedSource,
    target: normalizedTarget,
  }
}

export function parseDownloadMirrorRules(raw?: string | null): DownloadMirrorRule[] {
  if (!raw?.trim()) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn(
      `[download_mirrors] Ignoring invalid DOWNLOAD_MIRROR_RULES JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return []
  }

  const rules: DownloadMirrorRule[] = []

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('source' in entry) ||
        !('target' in entry) ||
        typeof entry.source !== 'string' ||
        typeof entry.target !== 'string'
      ) {
        console.warn('[download_mirrors] Ignoring malformed mirror rule in DOWNLOAD_MIRROR_RULES array')
        continue
      }

      try {
        rules.push(normalizeDownloadMirrorRule(entry.source, entry.target))
      } catch (error) {
        console.warn(
          `[download_mirrors] Ignoring invalid mirror rule ${JSON.stringify(entry)}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [source, target] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof target !== 'string') {
        console.warn(
          `[download_mirrors] Ignoring mirror rule for ${source}: target must be a string`
        )
        continue
      }

      try {
        rules.push(normalizeDownloadMirrorRule(source, target))
      } catch (error) {
        console.warn(
          `[download_mirrors] Ignoring invalid mirror rule ${source}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  } else {
    console.warn(
      '[download_mirrors] Ignoring DOWNLOAD_MIRROR_RULES because it must be a JSON object or array'
    )
    return []
  }

  return rules.sort((a, b) => b.source.length - a.source.length)
}

export function rewriteDownloadUrlWithRules(url: string, rules: DownloadMirrorRule[]): string {
  for (const rule of rules) {
    if (!url.startsWith(rule.source)) {
      continue
    }

    return joinMirrorUrl(rule.target, url.slice(rule.source.length))
  }

  return url
}

export function getConfiguredDownloadMirrorRules(): DownloadMirrorRule[] {
  const raw = process.env.DOWNLOAD_MIRROR_RULES

  if (raw === cachedMirrorRulesRaw) {
    return cachedMirrorRules
  }

  cachedMirrorRulesRaw = raw
  cachedMirrorRules = parseDownloadMirrorRules(raw)
  return cachedMirrorRules
}

export function rewriteDownloadUrl(url: string): string {
  return rewriteDownloadUrlWithRules(url, getConfiguredDownloadMirrorRules())
}

export type { DownloadMirrorRule }
