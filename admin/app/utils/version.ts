/**
 * Compare two semantic version strings to determine if the first is newer than the second.
 * @param version1 - The version to check (e.g., "1.25.0")
 * @param version2 - The current version (e.g., "1.24.0")
 * @returns true if version1 is newer than version2
 */
export function isNewerVersion(version1: string, version2: string, includePreReleases = false): boolean {
  const normalize = (v: string) => v.replace(/^v/, '')
  // Split on the first '-' only: prerelease identifiers may themselves contain '-'.
  const split = (v: string): [string, string | undefined] => {
    const i = v.indexOf('-')
    return i === -1 ? [v, undefined] : [v.slice(0, i), v.slice(i + 1)]
  }
  const [base1, pre1] = split(normalize(version1))
  const [base2, pre2] = split(normalize(version2))

  // If pre-releases are not included and version1 is a pre-release, don't consider it newer
  if (!includePreReleases && pre1) {
    return false
  }

  const v1Parts = base1.split('.').map((p) => parseInt(p, 10) || 0)
  const v2Parts = base2.split('.').map((p) => parseInt(p, 10) || 0)

  const maxLen = Math.max(v1Parts.length, v2Parts.length)
  for (let i = 0; i < maxLen; i++) {
    const a = v1Parts[i] || 0
    const b = v2Parts[i] || 0
    if (a > b) return true
    if (a < b) return false
  }

  // Base versions equal — GA > RC, RC.n+1 > RC.n
  if (!pre1 && pre2) return true // v1 is GA, v2 is RC → v1 is newer
  if (pre1 && !pre2) return false // v1 is RC, v2 is GA → v2 is newer
  if (!pre1 && !pre2) return false // both GA, equal

  // Both prerelease: semver precedence, identifier by identifier (label first, then
  // number), so "rc.1" > "beta.2" and "rc.10" > "rc.2".
  return comparePrerelease(pre1!, pre2!) > 0
}

/** Semver §11 prerelease precedence. Returns >0 when a is newer, <0 when older, 0 when equal. */
function comparePrerelease(a: string, b: string): number {
  const ids1 = a.split('.')
  const ids2 = b.split('.')
  const isNum = (id: string) => /^\d+$/.test(id)
  for (let i = 0; i < Math.max(ids1.length, ids2.length); i++) {
    const x = ids1[i]
    const y = ids2[i]
    if (x === undefined) return -1 // fewer identifiers = lower precedence
    if (y === undefined) return 1
    if (x === y) continue
    if (isNum(x) && isNum(y)) return Number(x) - Number(y)
    if (isNum(x)) return -1 // numeric identifiers sort below alphanumeric
    if (isNum(y)) return 1
    return x < y ? -1 : 1 // ASCII order
  }
  return 0
}

/**
 * A release tag safe to hand to the updater sidecar (it ends up in a sed expression
 * and a Docker image reference): "1.2.3", "v1.2.3", "v1.2.3-rc.1" or "latest".
 */
export function isValidReleaseTag(tag: string): boolean {
  return /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$|^latest$/.test(tag)
}

/**
 * Parse the major version number from a tag string.
 * Strips the 'v' prefix if present.
 * @param tag - Version tag (e.g., "v3.8.1", "10.19.4")
 * @returns The major version number
 */
export function parseMajorVersion(tag: string): number {
  const normalized = tag.replace(/^v/, '')
  const major = parseInt(normalized.split('.')[0], 10)
  return isNaN(major) ? 0 : major
}
