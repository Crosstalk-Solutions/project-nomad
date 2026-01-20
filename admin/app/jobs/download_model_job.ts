import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { OpenWebUIService } from '#services/openwebui_service'
import { createHash } from 'crypto'
import logger from '@adonisjs/core/services/logger'
import { DockerService } from '#services/docker_service'

export interface DownloadModelJobParams {
  modelName: string
}

export class DownloadModelJob {
  static get queue() {
    return 'model-downloads'
  }

  static get key() {
    return 'download-model'
  }

  static getJobId(modelName: string): string {
    return createHash('sha256').update(modelName).digest('hex').slice(0, 16)
  }

  async handle(job: Job) {
    const { modelName } = job.data as DownloadModelJobParams

    logger.info(`[DownloadModelJob] Attempting to download model: ${modelName}`)

    // Check if OpenWebUI/Ollama services are ready
    const dockerService = new DockerService()
    const openWebUIService = new OpenWebUIService(dockerService)

    // Use getInstalledModels to check if the service is ready
    // Even if no models are installed, this should return an empty array if ready
    const existingModels = await openWebUIService.getInstalledModels()
    if (!existingModels) {
      logger.warn(
        `[DownloadModelJob] OpenWebUI service not ready yet for model ${modelName}. Will retry...`
      )
      throw new Error('OpenWebUI service not ready yet')
    }

    logger.info(
      `[DownloadModelJob] OpenWebUI service is ready. Initiating download for ${modelName}`
    )

    // Services are ready, initiate the download with progress tracking
    const result = await openWebUIService._downloadModel(modelName, (progress) => {
      // Update job progress in BullMQ
      const progressData = {
        status: progress.status,
        percent: progress.percent,
        completed: progress.completed,
        total: progress.total,
      }

      // Update the job progress (0-100 scale for BullMQ)
      if (progress.percent !== undefined) {
        job.updateProgress(progress.percent)
      }

      // Log progress with job context
      if (progress.percent !== undefined) {
        logger.info(
          `[DownloadModelJob] Model ${modelName}: ${progress.status} - ${progress.percent}% (${progress.completed}/${progress.total} bytes)`
        )
      } else {
        logger.info(`[DownloadModelJob] Model ${modelName}: ${progress.status}`)
      }

      // Store detailed progress in job data for clients to query
      job.updateData({
        ...job.data,
        progress: progressData,
      })
    })

    if (!result.success) {
      logger.error(
        `[DownloadModelJob] Failed to initiate download for model ${modelName}: ${result.message}`
      )
      throw new Error(`Failed to initiate download for model: ${result.message}`)
    }

    logger.info(`[DownloadModelJob] Successfully completed download for model ${modelName}`)
    return {
      modelName,
      message: result.message,
    }
  }

  static async getByModelName(modelName: string): Promise<Job | undefined> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(modelName)
    return await queue.getJob(jobId)
  }

  static async dispatch(params: DownloadModelJobParams) {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(params.modelName)

    try {
      const job = await queue.add(this.key, params, {
        jobId,
        attempts: 40, // Many attempts since services may take considerable time to install
        backoff: {
          type: 'fixed',
          delay: 60000, // Check every 60 seconds
        },
        removeOnComplete: false, // Keep for status checking
        removeOnFail: false, // Keep failed jobs for debugging
      })

      return {
        job,
        created: true,
        message: `Dispatched model download job for ${params.modelName}`,
      }
    } catch (error) {
      if (error.message.includes('job already exists')) {
        const existing = await queue.getJob(jobId)
        return {
          job: existing,
          created: false,
          message: `Job already exists for model ${params.modelName}`,
        }
      }
      throw error
    }
  }
}
