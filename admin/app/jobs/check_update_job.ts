import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { DockerService } from '#services/docker_service'
import { SystemService } from '#services/system_service'
import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'

export class CheckUpdateJob {
  static get queue() {
    return 'system'
  }

  static get key() {
    return 'check-update'
  }

  async handle(_job: Job) {
    logger.info('[CheckUpdateJob] Running update check...')

    const dockerService = new DockerService()
    const systemService = new SystemService(dockerService)

    try {
      const result = await systemService.checkLatestVersion()

      if (result.updateAvailable) {
        logger.info(
          `[CheckUpdateJob] Update available: ${result.currentVersion} → ${result.latestVersion}`
        )
      } else {
        await KVStore.setValue('system.updateAvailable', "false")
        logger.info(
          `[CheckUpdateJob] System is up to date (${result.currentVersion})`
        )
      }

      return result
    } catch (error) {
      logger.error(`[CheckUpdateJob] Update check failed: ${error.message}`)
      throw error
    }
  }

  static async scheduleNightly() {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)

    await queue.upsertJobScheduler(
      'nightly-update-check',
      { pattern: '0 2,14 * * *' }, // Every 12 hours at 2am and 2pm
      {
        name: this.key,
        opts: {
          removeOnComplete: { count: 7 },
          removeOnFail: { count: 5 },
        },
      }
    )

    logger.info('[CheckUpdateJob] Update check scheduled with cron: 0 2,14 * * *')
  }

  static async dispatch() {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)

    const job = await queue.add(this.key, {}, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: { count: 7 },
      removeOnFail: { count: 5 },
    })

    logger.info(`[CheckUpdateJob] Dispatched ad-hoc update check job ${job.id}`)
    return job
  }
}
