/**
 * Log rotation for the containers NOMAD creates.
 *
 * Docker's default `json-file` driver keeps every line a container ever writes,
 * in one file, forever. On a small root disk that is an outage waiting to happen:
 * the log fills `/`, and MySQL is the first thing to fall over (#1412). Capping
 * each container at a few rotated files bounds the cost at ~30 MB.
 *
 * Kept pure so it runs under bare `node --test`; DockerService supplies the
 * daemon's default driver.
 */

export const LOG_MAX_SIZE = '10m'
export const LOG_MAX_FILE = '3'

export type LogConfig = { Type?: string; Config?: Record<string, string> }

/**
 * Return the LogConfig a new container should be created with, or undefined to
 * leave Docker's default untouched.
 *
 * Only `json-file` is ever touched. Any other driver (journald, local, syslog...)
 * was chosen by someone on purpose, and `max-size` is not even a valid option for
 * most of them, so passing it would make container creation fail. Likewise a
 * json-file config that already sets `max-size` (from the container's own config
 * or the daemon's `log-opts`) is the user's call and is kept as-is.
 */
export function withLogRotation(
  existing: LogConfig | undefined,
  daemonDefaultDriver: string | undefined
): LogConfig | undefined {
  const driver = existing?.Type || daemonDefaultDriver
  if (driver !== 'json-file') return existing

  const config = existing?.Config ?? {}
  if (config['max-size']) return existing

  return {
    Type: 'json-file',
    Config: { ...config, 'max-size': LOG_MAX_SIZE, 'max-file': LOG_MAX_FILE },
  }
}
