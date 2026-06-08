import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { DownloadService } from '#services/download_service'
import { ContentAutoUpdateService } from '#services/content_auto_update_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Hourly job that evaluates whether any installed content (ZIM/map) should
 * auto-update right now and, if so, dispatches the downloads. All gating (master
 * switch, content window, cool-off, per-window data cap, pre-flight, backoff)
 * lives in {@link ContentAutoUpdateService}; this job is just the scheduled
 * trigger. Runs hourly so it can act anywhere inside a user's window regardless
 * of the window's length. Mirrors {@link AppAutoUpdateJob}.
 */
export class ContentAutoUpdateJob {
  static get queue() {
    return 'system'
  }

  static get key() {
    return 'content-auto-update'
  }

  async handle(_job: Job) {
    logger.info('[ContentAutoUpdateJob] Evaluating content auto-updates...')

    const contentAutoUpdateService = new ContentAutoUpdateService(
      new DownloadService(QueueService.getInstance())
    )

    const result = await contentAutoUpdateService.attempt()
    logger.info(`[ContentAutoUpdateJob] ${result.started} started: ${result.reason}`)
    return result
  }

  static async schedule() {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    await queue.upsertJobScheduler(
      'hourly-content-auto-update',
      { pattern: '0 * * * *' }, // Top of every hour; attempt() gates on the window
      {
        name: this.key,
        opts: {
          removeOnComplete: { count: 12 },
          removeOnFail: { count: 5 },
        },
      }
    )

    logger.info('[ContentAutoUpdateJob] Content auto-update evaluation scheduled with cron: 0 * * * *')
  }

  static async dispatch() {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    const job = await queue.add(
      this.key,
      {},
      {
        attempts: 1,
        removeOnComplete: { count: 12 },
        removeOnFail: { count: 5 },
      }
    )

    logger.info(`[ContentAutoUpdateJob] Dispatched ad-hoc content auto-update evaluation job ${job.id}`)
    return job
  }
}
