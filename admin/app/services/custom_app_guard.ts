import { dirname, normalize } from 'node:path'
import env from '#start/env'

/**
 * Security guardrails for user-defined ("custom app") containers.
 *
 * project-nomad runs containers as host siblings via the mounted Docker socket (DooD), so a
 * misconfigured bind mount or image is a real host-takeover vector. The posture here is
 * "guardrails with warnings": hard-block the genuinely catastrophic, warn-but-allow the merely
 * risky so a trusted admin keeps their power without an easy foot-gun.
 */

export interface GuardEvaluation {
  /** Hard rejections — the install cannot proceed until these are fixed. */
  blocked: string[]
  /** Advisory warnings — overridable via the "install anyway" force flag. */
  warnings: string[]
}

/** Absolute host directories that must never be bind-mounted into a custom container. */
const SYSTEM_BLOCK_PREFIXES = ['/etc', '/proc', '/sys', '/boot', '/dev', '/run', '/var/run']

/** Registries we ship curated apps from; anything else is allowed but warned on. */
const TRUSTED_REGISTRIES = ['docker.io', 'registry-1.docker.io', 'ghcr.io', 'lscr.io', 'quay.io']

/** Resolve the managed storage root (where bind mounts are expected to live). */
export function getStorageRoot(): string {
  return normalize(env.get('NOMAD_STORAGE_PATH', '/opt/project-nomad/storage')).replace(/\/+$/, '')
}

/** Normalize an absolute path: collapse `..`/`.` segments and strip any trailing slash. */
function normalizeHostPath(p: string): string {
  return normalize(p).replace(/\/+$/, '') || '/'
}

/** True when `child` equals `ancestor` or sits beneath it. */
function isWithin(child: string, ancestor: string): boolean {
  return child === ancestor || child.startsWith(ancestor + '/')
}

/**
 * Evaluate user-supplied bind mounts. Hard-blocks the Docker socket, core system directories,
 * and any mount at or above project-nomad's own install tree (which would expose its code/data).
 * Warns on any host path outside the managed storage root.
 */
export function evaluateBindMounts(
  volumes: { host_path: string; container_path: string }[]
): GuardEvaluation {
  const blocked: string[] = []
  const warnings: string[] = []

  const storageRoot = getStorageRoot()
  // The install tree is the parent of the storage root (e.g. /opt/project-nomad). Mounting it —
  // or any ancestor, up to and including `/` — would hand a container project-nomad's own files.
  const installRoot = dirname(storageRoot)

  for (const { host_path: hostPath, container_path: containerPath } of volumes) {
    const host = normalizeHostPath(hostPath)

    if (!hostPath.startsWith('/')) {
      blocked.push(`Volume host path "${hostPath}" must be an absolute path.`)
      continue
    }
    if (!containerPath.startsWith('/')) {
      blocked.push(`Volume container path "${containerPath}" must be an absolute path.`)
      continue
    }

    // A colon is Docker's bind delimiter (host:container:options). A path containing one would be
    // re-split by Docker into a different mount than the one validated here — reject it outright so
    // the checks below can't be bypassed by a parse-differential. (The validator blocks this too;
    // this keeps the guard self-defending for any caller that skips validation.)
    if (hostPath.includes(':') || containerPath.includes(':')) {
      blocked.push(`Volume paths must not contain a colon (":"): "${hostPath}" → "${containerPath}".`)
      continue
    }

    // The Docker socket is the most dangerous mount of all — full control of the host daemon.
    if (host.endsWith('docker.sock') || /\/docker\.sock$/.test(host)) {
      blocked.push(
        `Mounting the Docker socket ("${hostPath}") is not allowed — it grants full host control.`
      )
      continue
    }

    // Core system directories.
    if (host === '/' || SYSTEM_BLOCK_PREFIXES.some((p) => isWithin(host, p))) {
      blocked.push(`Mounting system directory "${hostPath}" is not allowed.`)
      continue
    }

    // At or above project-nomad's own install tree (covers `/`, `/opt`, `/opt/project-nomad`).
    if (host === installRoot || isWithin(installRoot, host)) {
      blocked.push(
        `Mounting "${hostPath}" would expose project-nomad's own files and is not allowed.`
      )
      continue
    }

    // Anything outside the managed storage root is allowed but flagged.
    if (!isWithin(host, storageRoot)) {
      warnings.push(
        `Volume "${hostPath}" is outside the managed storage root (${storageRoot}). Make sure you trust this image with access to that path.`
      )
    }
  }

  return { blocked, warnings }
}

/**
 * Evaluate a Docker image reference. Hard-blocks malformed references; warns on moving tags
 * (`:latest`/untagged) and images from registries outside the trusted set.
 */
export function evaluateImageReference(image: string): GuardEvaluation {
  const blocked: string[] = []
  const warnings: string[] = []

  const ref = image.trim()
  // Loose validity check: no whitespace/control chars, and a sane character set for an image ref.
  if (!ref || /\s/.test(ref) || !/^[\w./:@-]+$/.test(ref)) {
    blocked.push(`"${image}" is not a valid image reference.`)
    return { blocked, warnings }
  }

  // Split off any digest, then any tag, to inspect the registry and tag.
  const [nameAndTag] = ref.split('@')
  const firstSegment = nameAndTag.split('/')[0]
  const hasRegistryHost =
    nameAndTag.includes('/') && (firstSegment.includes('.') || firstSegment.includes(':'))
  const registry = hasRegistryHost ? firstSegment.split(':')[0] : 'docker.io'

  if (!TRUSTED_REGISTRIES.includes(registry)) {
    warnings.push(
      `Image is from "${registry}", which is outside project-nomad's trusted registries. Only install images you trust.`
    )
  }

  // Determine the tag (ignore a colon that's part of a registry host:port in the first segment).
  const remainder = hasRegistryHost ? nameAndTag.slice(firstSegment.length + 1) : nameAndTag
  const tag = remainder.includes(':') ? remainder.split(':').pop() : undefined
  const hasDigest = ref.includes('@sha256:')
  if (!hasDigest && (!tag || tag === 'latest')) {
    warnings.push(
      `Image "${image}" uses a moving tag (${tag ? ':latest' : 'no tag'}). Pin a specific version for reproducible installs.`
    )
  }

  return { blocked, warnings }
}

/** Combine bind-mount and image evaluations into a single result. */
export function evaluateCustomApp(input: {
  image?: string
  volumes?: { host_path: string; container_path: string }[]
}): GuardEvaluation {
  const bind = evaluateBindMounts(input.volumes ?? [])
  const img = input.image ? evaluateImageReference(input.image) : { blocked: [], warnings: [] }
  return {
    blocked: [...bind.blocked, ...img.blocked],
    warnings: [...bind.warnings, ...img.warnings],
  }
}

/** Default resource caps applied to custom containers unless the user overrides them. */
export const DEFAULT_MEMORY_MB = 1024
export const DEFAULT_CPUS = 1
