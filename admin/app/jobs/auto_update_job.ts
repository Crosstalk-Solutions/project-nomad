import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { DockerService } from '#services/docker_service'
import { DownloadService } from '#services/download_service'
import { SystemService } from '#services/system_service'
import { SystemUpdateService } from '#services/system_update_service'
import { ContainerRegistryService } from '#services/container_registry_service'
import { AutoUpdateService } from '#services/auto_update_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Hourly job that evaluates whether the NOMAD application should auto-update right
 * now and, if so, requests it. All gating (opt-in, window, eligibility, cool-off,
 * pre-flight, backoff) lives in {@link AutoUpdateService}; this job is just the
 * scheduled trigger. Runs hourly so it can act anywhere inside a user's window
 * regardless of the window's length.
 */
export class AutoUpdateJob {
  static get queue() {
    return 'system'
  }

  static get key() {
    return 'auto-update'
  }

  async handle(_job: Job) {
    logger.info('[AutoUpdateJob] Evaluating auto-update...')

    const dockerService = new DockerService()
    const autoUpdateService = new AutoUpdateService(
      dockerService,
      new DownloadService(QueueService.getInstance()),
      new SystemService(dockerService),
      new SystemUpdateService(),
      new ContainerRegistryService()
    )

    const result = await autoUpdateService.attempt()
    logger.info(`[AutoUpdateJob] ${result.updated ? 'Updating' : 'No update'}: ${result.reason}`)
    return result
  }

  static async schedule() {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    await queue.upsertJobScheduler(
      'hourly-auto-update',
      { pattern: '0 * * * *' }, // Top of every hour; attempt() gates on the window
      {
        name: this.key,
        opts: {
          removeOnComplete: { count: 12 },
          removeOnFail: { count: 5 },
        },
      }
    )

    logger.info('[AutoUpdateJob] Auto-update evaluation scheduled with cron: 0 * * * *')
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

    logger.info(`[AutoUpdateJob] Dispatched ad-hoc auto-update evaluation job ${job.id}`)
    return job
  }
}
