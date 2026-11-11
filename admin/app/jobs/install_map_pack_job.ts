import type { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { MapPackService } from '#services/map_pack_service'
import { MapPackError, mapPackId } from '../utils/map_pack_manifest.js'

interface InstallMapPackParams {
  packageId: string
  version: string
}

export class InstallMapPackJob {
  static get queue() {
    return 'map-pack-downloads'
  }
  static get key() {
    return 'install-map-pack'
  }

  static async dispatch(packageId: string, version: string) {
    const queue = QueueService.getInstance().getQueue(this.queue)
    const jobId = `map-pack-${mapPackId(packageId)}`
    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (['active', 'waiting', 'delayed', 'waiting-children'].includes(state)) return existing
      await existing.remove()
    }
    return await queue.add(this.key, { packageId, version } satisfies InstallMapPackParams, {
      jobId,
      // Retain the partial artifact for the user's explicit Retry Download action.
      // Automatic delayed retries could recreate a pack after the user removes it.
      attempts: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 20 },
    })
  }

  static async removePending(packageId: string) {
    const queue = QueueService.getInstance().getQueue(this.queue)
    const job = await queue.getJob(`map-pack-${mapPackId(packageId)}`)
    if (!job) return false
    if ((await job.getState()) === 'active') {
      throw new MapPackError('Wait for the package download to finish before removing it.', 409)
    }
    try {
      // BullMQ atomically refuses removal if a worker acquired the job after our check.
      await job.remove()
      return true
    } catch {
      throw new MapPackError(
        'The package download is starting. Wait for it to finish before removing it.',
        409
      )
    }
  }

  async handle(job: Job<InstallMapPackParams>) {
    const service = new MapPackService()
    try {
      await service.install(job.data.packageId, job.data.version, async (progress) => {
        await job.updateProgress(progress)
      })
    } catch (error) {
      await service.failInstall(job.data.packageId, error)
      throw error
    }
    return { packageId: job.data.packageId, version: job.data.version }
  }
}
