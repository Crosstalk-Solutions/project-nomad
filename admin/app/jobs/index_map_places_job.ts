import { Job } from 'bullmq'
import logger from '@adonisjs/core/services/logger'
import { QueueService } from '#services/queue_service'
import { MapPlaceIndexService } from '#services/map_place_index_service'

/**
 * Keeps the offline place-search index in line with the downloaded map regions (#1574).
 *
 * One reconcile job at a time (fixed job id): it indexes new or replaced region files and drops
 * the places of deleted ones, looping until nothing is left to do. Dispatched when the worker
 * starts, after a map download or extract completes, after a region is deleted, and lazily by
 * search when it notices a region that isn't searchable yet. Re-running it is always safe.
 */
export class IndexMapPlacesJob {
  static get queue() {
    return 'map-places'
  }

  static get key() {
    return 'index-map-places'
  }

  static readonly JOB_ID = 'reconcile-map-places'

  async handle(_job: Job) {
    await new MapPlaceIndexService().reconcile()
  }

  static async dispatch(): Promise<void> {
    try {
      const queue = QueueService.getInstance().getQueue(this.queue)
      const existing = await queue.getJob(this.JOB_ID)
      if (existing) {
        const state = await existing.getState()
        // Waiting: it will see the current files when it starts. Active: it loops until the
        // disk and the index agree, and search re-dispatches for anything that lands after.
        if (state === 'waiting' || state === 'active' || state === 'delayed') return
        await existing.remove().catch(() => {})
      }
      await queue.add(
        this.key,
        {},
        { jobId: this.JOB_ID, removeOnComplete: true, removeOnFail: true }
      )
    } catch (error: any) {
      logger.warn(`[IndexMapPlacesJob] Could not dispatch: ${error?.message ?? error}`)
    }
  }
}
