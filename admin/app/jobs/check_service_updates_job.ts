import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { DockerService } from '#services/docker_service'
import { ContainerRegistryService } from '#services/container_registry_service'
import Service from '#models/service'
import logger from '@adonisjs/core/services/logger'
import transmit from '@adonisjs/transmit/services/main'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'
import { DateTime } from 'luxon'

export class CheckServiceUpdatesJob {
  static get queue() {
    return 'service-updates'
  }

  static get key() {
    return 'check-service-updates'
  }

  async handle(_job: Job) {
    logger.info('[CheckServiceUpdatesJob] Checking for service updates...')

    const dockerService = new DockerService()
    const registryService = new ContainerRegistryService()

    // Determine host architecture
    const hostArch = await this.getHostArch(dockerService)

    const installedServices = await Service.query().where('installed', true)
    let updatesFound = 0

    for (const service of installedServices) {
      try {
        const updates = await registryService.getAvailableUpdates(
          service.container_image,
          hostArch,
          service.source_repo
        )

        const latestUpdate = updates.length > 0 ? updates[0].tag : null

        service.available_update_version = latestUpdate
        service.update_checked_at = DateTime.now()
        await service.save()

        if (latestUpdate) {
          updatesFound++
          logger.info(
            `[CheckServiceUpdatesJob] Update available for ${service.service_name}: ${service.container_image} → ${latestUpdate}`
          )
        }
      } catch (error) {
        logger.error(
          `[CheckServiceUpdatesJob] Failed to check updates for ${service.service_name}: ${error.message}`
        )
        // Continue checking other services
      }
    }

    logger.info(
      `[CheckServiceUpdatesJob] Completed. ${updatesFound} update(s) found for ${installedServices.length} service(s).`
    )

    // Broadcast completion so the frontend can refresh
    transmit.broadcast(BROADCAST_CHANNELS.SERVICE_UPDATES, {
      status: 'completed',
      updatesFound,
      timestamp: new Date().toISOString(),
    })

    return { updatesFound }
  }

  private async getHostArch(dockerService: DockerService): Promise<string> {
    try {
      const info = await dockerService.docker.info()
      const arch = info.Architecture || ''

      // Map Docker architecture names to OCI names
      const archMap: Record<string, string> = {
        x86_64: 'amd64',
        aarch64: 'arm64',
        armv7l: 'arm',
        amd64: 'amd64',
        arm64: 'arm64',
      }

      return archMap[arch] || arch.toLowerCase()
    } catch (error) {
      logger.warn(
        `[CheckServiceUpdatesJob] Could not detect host architecture: ${error.message}. Defaulting to amd64.`
      )
      return 'amd64'
    }
  }

  static async scheduleNightly() {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)

    await queue.upsertJobScheduler(
      'nightly-service-update-check',
      { pattern: '0 3 * * *' },
      {
        name: this.key,
        opts: {
          removeOnComplete: { count: 7 },
          removeOnFail: { count: 5 },
        },
      }
    )

    logger.info('[CheckServiceUpdatesJob] Service update check scheduled with cron: 0 3 * * *')
  }

  static async dispatch() {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)

    const job = await queue.add(
      this.key,
      {},
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: { count: 7 },
        removeOnFail: { count: 5 },
      }
    )

    logger.info(`[CheckServiceUpdatesJob] Dispatched ad-hoc service update check job ${job.id}`)
    return job
  }
}
