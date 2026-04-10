import { Job, UnrecoverableError } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { createHash } from 'crypto'
import logger from '@adonisjs/core/services/logger'
import { OllamaService } from '#services/ollama_service'

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

  /** In-memory registry of abort controllers for active model download jobs */
  static abortControllers: Map<string, AbortController> = new Map()

  /**
   * Redis key used to signal cancellation across processes. Uses a `model-cancel` prefix
   * so it cannot collide with content download cancel signals (`nomad:download:cancel:*`).
   */
  static cancelKey(jobId: string): string {
    return `nomad:download:model-cancel:${jobId}`
  }

  /** Signal cancellation via Redis so the worker process can pick it up on its next poll tick */
  static async signalCancel(jobId: string): Promise<void> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const client = await queue.client
    await client.set(this.cancelKey(jobId), '1', 'EX', 300) // 5 min TTL
  }

  async handle(job: Job) {
    const { modelName } = job.data as DownloadModelJobParams

    logger.info(`[DownloadModelJob] Attempting to download model: ${modelName}`)

    const ollamaService = new OllamaService()

    // Even if no models are installed, this should return an empty array if ready
    const existingModels = await ollamaService.getModels()
    if (!existingModels) {
      logger.warn(
        `[DownloadModelJob] Ollama service not ready yet for model ${modelName}. Will retry...`
      )
      throw new Error('Ollama service not ready yet')
    }

    logger.info(
      `[DownloadModelJob] Ollama service is ready. Initiating download for ${modelName}`
    )

    // Register abort controller for this job — used both by in-process cancels (same process
    // as the API server) and as the target of the Redis poll loop below.
    const abortController = new AbortController()
    DownloadModelJob.abortControllers.set(job.id!, abortController)

    // Get Redis client for checking cancel signals from the API process
    const queueService = new QueueService()
    const cancelRedis = await queueService.getQueue(DownloadModelJob.queue).client

    // Track whether cancellation was explicitly requested by the user. Only user-initiated
    // cancels become UnrecoverableError — other failures (e.g., transient network errors)
    // should still benefit from BullMQ's retry logic.
    let userCancelled = false

    // Poll Redis for cancel signal every 2s — independent of progress events so cancellation
    // works even when the pull is mid-blob and not emitting progress updates.
    let cancelPollInterval: ReturnType<typeof setInterval> | null = setInterval(async () => {
      try {
        const val = await cancelRedis.get(DownloadModelJob.cancelKey(job.id!))
        if (val) {
          await cancelRedis.del(DownloadModelJob.cancelKey(job.id!))
          userCancelled = true
          abortController.abort('user-cancel')
        }
      } catch {
        // Redis errors are non-fatal; in-process AbortController covers same-process cancels
      }
    }, 2000)

    try {
      // Services are ready, initiate the download with progress tracking
      const result = await ollamaService.downloadModel(
        modelName,
        (progressPercent, bytes) => {
          if (progressPercent) {
            job.updateProgress(Math.floor(progressPercent)).catch((err) => {
              if (err?.code !== -1) throw err
            })
          }

          // Store detailed progress in job data for clients to query
          job.updateData({
            ...job.data,
            status: 'downloading',
            progress: progressPercent,
            downloadedBytes: bytes?.downloadedBytes,
            totalBytes: bytes?.totalBytes,
            progress_timestamp: new Date().toISOString(),
          }).catch((err) => {
            if (err?.code !== -1) throw err
          })
        },
        abortController.signal,
        job.id!
      )

      if (!result.success) {
        logger.error(
          `[DownloadModelJob] Failed to initiate download for model ${modelName}: ${result.message}`
        )
        // User-initiated cancel — must be unrecoverable to avoid the 40-attempt retry storm.
        // The downloadModel() catch block returns retryable: false for cancels, so this branch
        // catches both Ollama version mismatches (existing) AND user cancels (new).
        if (result.retryable === false) {
          throw new UnrecoverableError(result.message)
        }
        throw new Error(`Failed to initiate download for model: ${result.message}`)
      }

      logger.info(`[DownloadModelJob] Successfully completed download for model ${modelName}`)
      return {
        modelName,
        message: result.message,
      }
    } catch (error: any) {
      // Belt-and-suspenders: if downloadModel didn't recognize the cancel (e.g., the abort
      // fired after the response stream completed but before our code returned), the cancel
      // flag tells us this was a user action and should be unrecoverable.
      if (userCancelled || abortController.signal.reason === 'user-cancel') {
        if (!(error instanceof UnrecoverableError)) {
          throw new UnrecoverableError(`Model download cancelled: ${error.message ?? error}`)
        }
      }
      throw error
    } finally {
      if (cancelPollInterval !== null) {
        clearInterval(cancelPollInterval)
        cancelPollInterval = null
      }
      DownloadModelJob.abortControllers.delete(job.id!)
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

    // Clear any previous failed job so a fresh attempt can be dispatched
    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'failed') {
        await existing.remove()
      }
    }

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
        const active = await queue.getJob(jobId)
        return {
          job: active,
          created: false,
          message: `Job already exists for model ${params.modelName}`,
        }
      }
      throw error
    }
  }
}
