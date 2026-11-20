import Docker from 'dockerode'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Resolve Dockerode connection options from environment variables.
 *
 * When `DOCKER_HOST` is set (e.g. `tcp://docker-socket-proxy:2375`,
 * `unix:///var/run/docker.sock`, `npipe:////./pipe/docker_engine`), parses it
 * along with `DOCKER_TLS_VERIFY`, `DOCKER_CERT_PATH`, `DOCKER_PATH_PREFIX`, and
 * `DOCKER_CLIENT_TIMEOUT` (matching docker-modem's env conventions).
 *
 * When `DOCKER_HOST` is unset or empty, falls back to the platform's standard
 * local socket (`//./pipe/docker_engine` on Windows, `/var/run/docker.sock` on
 * Linux/macOS) rather than docker-modem's `~/.docker/run/docker.sock` probe.
 */
export function resolveDockerOptions(
  envVars: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Docker.DockerOptions {
  const rawHost = envVars.DOCKER_HOST?.trim()
  const defaultUnixSocket = '/var/run/docker.sock'
  const defaultWinPipe = '//./pipe/docker_engine'

  if (!rawHost) {
    return {
      socketPath: platform === 'win32' ? defaultWinPipe : defaultUnixSocket,
    }
  }

  if (rawHost.startsWith('unix://')) {
    return {
      socketPath: rawHost.slice('unix://'.length) || defaultUnixSocket,
    }
  }

  if (rawHost.startsWith('npipe://')) {
    return {
      socketPath: rawHost.slice('npipe://'.length) || defaultWinPipe,
    }
  }

  const hostStr = rawHost.includes('://') ? rawHost : `tcp://${rawHost}`
  let parsed: URL
  try {
    parsed = new URL(hostStr)
  } catch {
    throw new Error(
      `Invalid DOCKER_HOST "${rawHost}". Expected e.g. tcp://docker-socket-proxy:2375 or unix:///var/run/docker.sock`
    )
  }

  if (!parsed.hostname) {
    throw new Error(`Invalid DOCKER_HOST "${rawHost}": missing hostname`)
  }

  const opts: Docker.DockerOptions = {
    host: parsed.hostname,
  }

  if (parsed.port) {
    opts.port = parsed.port
  }

  if (parsed.protocol === 'https:' || envVars.DOCKER_TLS_VERIFY === '1' || opts.port === '2376') {
    opts.protocol = 'https'
  } else if (parsed.protocol === 'ssh:') {
    opts.protocol = 'ssh'
    if (parsed.username) {
      opts.username = decodeURIComponent(parsed.username)
    }
    if (envVars.SSH_AUTH_SOCK) {
      opts.sshOptions = { agent: envVars.SSH_AUTH_SOCK }
    }
  } else {
    opts.protocol = 'http'
  }

  if (envVars.DOCKER_PATH_PREFIX) {
    ;(opts as Docker.DockerOptions & { pathPrefix?: string }).pathPrefix =
      envVars.DOCKER_PATH_PREFIX
  }

  if (envVars.DOCKER_CERT_PATH) {
    const certDir = envVars.DOCKER_CERT_PATH
    opts.ca = fs.readFileSync(path.join(certDir, 'ca.pem'))
    opts.cert = fs.readFileSync(path.join(certDir, 'cert.pem'))
    opts.key = fs.readFileSync(path.join(certDir, 'key.pem'))
  }

  if (envVars.DOCKER_CLIENT_TIMEOUT) {
    const timeout = Number.parseInt(envVars.DOCKER_CLIENT_TIMEOUT, 10)
    if (Number.isFinite(timeout) && timeout > 0) {
      opts.timeout = timeout
    }
  }

  return opts
}

/** Create a Dockerode client honoring `DOCKER_HOST` when configured. */
export function createDockerClient(
  envVars: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): Docker {
  return new Docker(resolveDockerOptions(envVars, platform))
}
