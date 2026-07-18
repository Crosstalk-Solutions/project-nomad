import logger from '@adonisjs/core/services/logger'
import type { ContainerRegistryService } from '#services/container_registry_service'
import type { SystemService } from '#services/system_service'

/**
 * Shared pre-flight primitives for update flows (core app + installed apps).
 * Kept framework-light (plain functions + injected service instances) so both
 * {@link AutoUpdateService} and {@link AppAutoUpdateService} reuse one implementation.
 */

export type BlockerSeverity = 'skip' | 'failure'

export interface Blocker {
  reason: string
  severity: BlockerSeverity
}

export interface PreflightResult {
  ok: boolean
  blockers: Blocker[]
}

/** Require free space >= imageSize * factor to cover decompressed layers + headroom. */
export const DISK_SAFETY_FACTOR = 2
/** Conservative fallback when the registry image size can't be determined. */
export const MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GiB

/** Free bytes on the root filesystem (best-effort, falls back to max available). */
export async function getFreeBytes(systemService: SystemService): Promise<number | null> {
  const info = await systemService.getSystemInfo()
  if (!info?.fsSize?.length) return null
  const root = info.fsSize.find((f) => f.mount === '/')
  if (root) return root.available
  return Math.max(...info.fsSize.map((f) => f.available))
}

function gib(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GiB`
}

/**
 * Returns a `failure` disk blocker if free space is insufficient for the given
 * image reference, otherwise null. Mirrors the core update's behavior: estimate
 * the image's compressed download size from the registry manifest, require
 * `size * DISK_SAFETY_FACTOR` (or {@link MIN_FREE_BYTES} when size is unknown),
 * and never block on transient lookup errors (returns null on failure).
 *
 * @param image Full image reference INCLUDING tag (e.g. "ollama/ollama:0.23.2").
 */
export async function checkImageDiskSpace(params: {
  image: string
  hostArch: string
  containerRegistryService: ContainerRegistryService
  systemService: SystemService
}): Promise<Blocker | null> {
  const { image, hostArch, containerRegistryService, systemService } = params
  try {
    const parsed = containerRegistryService.parseImageReference(image)
    const imageSize = await containerRegistryService.getImageDownloadSize(
      parsed,
      parsed.tag,
      hostArch
    )
    const required = imageSize !== null ? imageSize * DISK_SAFETY_FACTOR : MIN_FREE_BYTES

    const free = await getFreeBytes(systemService)
    if (free === null) {
      logger.warn('[ImageDiskPreflight] Could not determine free disk space; skipping disk check')
      return null
    }

    if (free < required) {
      return {
        reason: `Insufficient disk space: ${gib(free)} free, ${gib(required)} required`,
        severity: 'failure',
      }
    }
    return null
  } catch (error) {
    logger.warn(`[ImageDiskPreflight] Disk space check failed: ${error.message}`)
    return null
  }
}
