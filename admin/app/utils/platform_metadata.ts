/**
 * Pure helpers for turning the Docker daemon's platform strings into the fields
 * the benchmark submission carries.
 *
 * These read the HOST's platform, which is the entire point: inside the admin
 * container `os.arch()` and `si.osInfo()` describe the container, not the
 * machine being benchmarked. `BenchmarkService` delegates to these so the string
 * handling is unit-testable without a Docker daemon.
 *
 * Observed daemon output across the test fleet:
 *
 *   Architecture      'x86_64'                  | 'aarch64'
 *   OSVersion         '24.04'                   | '26.04'
 *   OperatingSystem   'Ubuntu 24.04.4 LTS'      | 'Ubuntu 26.04 LTS'
 */

/**
 * Canonicalise the daemon's architecture string to the OCI platform names used
 * everywhere else in the project (image manifests, install docs, the
 * leaderboard).
 *
 * Docker reports `x86_64` / `aarch64`; images and the board talk in `amd64` /
 * `arm64`. A fixed two-way map rather than a general normalisation table: these
 * are the only architectures NOMAD targets, and anything unrecognised passes
 * through verbatim rather than being guessed at, so an unexpected platform shows
 * up honestly instead of mislabelled.
 */
export function normalizeArchitecture(raw: string): string {
  const map: Record<string, string> = {
    x86_64: 'amd64',
    amd64: 'amd64',
    aarch64: 'arm64',
    arm64: 'arm64',
  }
  const key = raw.trim().toLowerCase()
  return map[key] ?? raw.trim()
}

/**
 * Split the distro name out of the daemon's free-form OperatingSystem string.
 *
 * `OperatingSystem` is a description ('Ubuntu 24.04.4 LTS') while `OSVersion` is
 * structured ('24.04'). Taking the text before the version yields the name
 * without hand-maintaining a list of distributions:
 *
 *   'Ubuntu 24.04.4 LTS'             + '24.04' -> 'Ubuntu'
 *   'Ubuntu 26.04 LTS'               + '26.04' -> 'Ubuntu'
 *   'Debian GNU/Linux 12 (bookworm)' + '12'    -> 'Debian GNU/Linux'
 *
 * Falls back to the full description whenever the version is missing, empty, or
 * doesn't appear in the string. An over-long name is harmless; a wrong one is
 * not, and silently truncating an unfamiliar distro would be worse than leaving
 * it verbose.
 */
export function deriveOsName(operatingSystem: string, osVersion: string | null): string {
  const description = operatingSystem.trim()
  if (!osVersion) return description

  const version = osVersion.trim()
  if (version === '') return description

  const idx = description.indexOf(version)
  // idx === 0 means the string starts with the version and has no name to take.
  if (idx <= 0) return description

  const name = description.slice(0, idx).trim()
  return name.length > 0 ? name : description
}
