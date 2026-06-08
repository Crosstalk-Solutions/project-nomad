import logger from '@adonisjs/core/services/logger'
import type InstalledResource from '#models/installed_resource'

/**
 * Per-resource failure backoff for content (ZIM/map) auto-updates, shared by the
 * three places that observe an auto-update's real lifecycle:
 *
 *   - {@link ContentAutoUpdateService.attempt} — a dispatch that fails to even
 *     enqueue (counts as a failure; no job runs so no terminal event follows).
 *   - `RunDownloadJob.onComplete` — a download that actually finished (success).
 *   - the worker `failed` handler in `commands/queue/work.ts` — a download that
 *     exhausted its retries (terminal failure).
 *
 * Kept in a dependency-light util (not on ContentAutoUpdateService) on purpose:
 * RunDownloadJob is imported by CollectionUpdateService, which is imported by
 * ContentAutoUpdateService, so importing the service back into the job would
 * close an import cycle. Only the InstalledResource model and the logger are
 * touched here.
 */

/** Genuine consecutive auto-update failures before a resource self-disables. */
export const MAX_CONSECUTIVE_FAILURES = 3

/** Clear a resource's failure backoff after a successful auto-update. */
export async function recordResourceUpdateSuccess(resource: InstalledResource): Promise<void> {
  if (resource.auto_update_consecutive_failures === 0 && !resource.auto_update_disabled_reason) {
    return
  }
  resource.auto_update_consecutive_failures = 0
  resource.auto_update_disabled_reason = null
  await resource.save()
}

/** Record an auto-update failure and self-disable the resource at the threshold. */
export async function recordResourceUpdateFailure(
  resource: InstalledResource,
  reason: string
): Promise<void> {
  const failures = (resource.auto_update_consecutive_failures || 0) + 1
  resource.auto_update_consecutive_failures = failures
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    resource.auto_update_disabled_reason = `Auto-update disabled after ${failures} consecutive failures. Last error: ${reason}`
    logger.error(
      `[ContentAutoUpdate] ${resource.resource_id} auto-disabled after ${failures} failures`
    )
  }
  await resource.save()
  logger.error(
    `[ContentAutoUpdate] ${resource.resource_id} failure ${failures}/${MAX_CONSECUTIVE_FAILURES}: ${reason}`
  )
}
