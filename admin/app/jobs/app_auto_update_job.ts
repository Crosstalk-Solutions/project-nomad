import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { DockerService } from '#services/docker_service'
import { DownloadService } from '#services/download_service'
import { SystemService } from '#services/system_service'
import { ContainerRegistryService } from '#services/container_registry_service'
import { AppAutoUpdateService } from '#services/app_auto_update_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Hourly job that evaluates whether any opted-in installed apps should auto-update
 * right now and, if so, updates them. All gating (master switch, per-app opt-in,
 * window, cool-off, pre-flight, per-app backoff) lives in {@link AppAutoUpdateService};
 * this job is just the scheduled trigger. Runs hourly so it can act anywhere inside a
 * user's window regardless of the window's length. Mirrors {@link AutoUpdateJob}.
 */
export class AppAutoUpdateJob {
  static get queue() {
    return 'system'
  }

  static get key() {
    return 'app-auto-update'
  }

  async handle(_job: Job) {
    logger.info('[AppAutoUpdateJob] Evaluating app auto-updates...')

    const dockerService = new DockerService()
    const appAutoUpdateService = new AppAutoUpdateService(
      dockerService,
      new DownloadService(QueueService.getInstance()),
      new SystemService(dockerService),
      new ContainerRegistryService()
    )

    const result = await appAutoUpdateService.attempt()
    logger.info(`[AppAutoUpdateJob] ${result.updated} updated: ${result.reason}`)
    return result
  }

  static async schedule() {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    await queue.upsertJobScheduler(
      'hourly-app-auto-update',
      { pattern: '0 * * * *' }, // Top of every hour; attempt() gates on the window
      {
        name: this.key,
        opts: {
          removeOnComplete: { count: 12 },
          removeOnFail: { count: 5 },
        },
      }
    )

    logger.info('[AppAutoUpdateJob] App auto-update evaluation scheduled with cron: 0 * * * *')
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

    logger.info(`[AppAutoUpdateJob] Dispatched ad-hoc app auto-update evaluation job ${job.id}`)
    return job
  }
}
