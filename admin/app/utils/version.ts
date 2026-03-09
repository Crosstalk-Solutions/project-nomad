/**
 * Compare two semantic version strings to determine if the first is newer than the second.
 * @param version1 - The version to check (e.g., "1.25.0")
 * @param version2 - The current version (e.g., "1.24.0")
 * @returns true if version1 is newer than version2
 */
export function isNewerVersion(version1: string, version2: string, includePreReleases = false): boolean {
  const normalize = (v: string) => v.replace(/^v/, '')
  const [base1, pre1] = normalize(version1).split('-')
  const [base2, pre2] = normalize(version2).split('-')

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

  // Both prerelease: compare numeric suffix (e.g. "rc.2" vs "rc.1")
  const pre1Num = parseInt(pre1.split('.')[1], 10) || 0
  const pre2Num = parseInt(pre2.split('.')[1], 10) || 0
  return pre1Num > pre2Num
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
