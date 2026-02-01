import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { RagService } from '#services/rag_service'
import { DockerService } from '#services/docker_service'
import { OllamaService } from '#services/ollama_service'
import { createHash } from 'crypto'
import logger from '@adonisjs/core/services/logger'

export interface EmbedFileJobParams {
  filePath: string
  fileName: string
  fileSize?: number
}

export class EmbedFileJob {
  static get queue() {
    return 'file-embeddings'
  }

  static get key() {
    return 'embed-file'
  }

  static getJobId(filePath: string): string {
    return createHash('sha256').update(filePath).digest('hex').slice(0, 16)
  }

  async handle(job: Job) {
    const { filePath, fileName } = job.data as EmbedFileJobParams

    logger.info(`[EmbedFileJob] Starting embedding process for: ${fileName}`)

    const dockerService = new DockerService()
    const ollamaService = new OllamaService()
    const ragService = new RagService(dockerService, ollamaService)

    try {
      // Update progress starting
      await job.updateProgress(0)
      await job.updateData({
        ...job.data,
        status: 'processing',
        startedAt: Date.now(),
      })

      logger.info(`[EmbedFileJob] Processing file: ${filePath}`)

      // Process and embed the file
      const result = await ragService.processAndEmbedFile(filePath)

      if (!result.success) {
        logger.error(`[EmbedFileJob] Failed to process file ${fileName}: ${result.message}`)
        throw new Error(result.message)
      }

      // Update progress complete
      await job.updateProgress(100)
      await job.updateData({
        ...job.data,
        status: 'completed',
        completedAt: Date.now(),
        chunks: result.chunks,
      })

      logger.info(
        `[EmbedFileJob] Successfully embedded ${result.chunks} chunks from file: ${fileName}`
      )

      return {
        success: true,
        fileName,
        filePath,
        chunks: result.chunks,
        message: `Successfully embedded ${result.chunks} chunks`,
      }
    } catch (error) {
      logger.error(`[EmbedFileJob] Error embedding file ${fileName}:`, error)

      await job.updateData({
        ...job.data,
        status: 'failed',
        failedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      throw error
    }
  }

  static async getByFilePath(filePath: string): Promise<Job | undefined> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(filePath)
    return await queue.getJob(jobId)
  }

  static async dispatch(params: EmbedFileJobParams) {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(params.filePath)

    try {
      const job = await queue.add(this.key, params, {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // Delay 5 seconds before retrying
        },
        removeOnComplete: { count: 50 }, // Keep last 50 completed jobs for history
        removeOnFail: { count: 20 } // Keep last 20 failed jobs for debugging
      })

      logger.info(`[EmbedFileJob] Dispatched embedding job for file: ${params.fileName}`)

      return {
        job,
        created: true,
        jobId,
        message: `File queued for embedding: ${params.fileName}`,
      }
    } catch (error) {
      if (error.message && error.message.includes('job already exists')) {
        const existing = await queue.getJob(jobId)
        logger.info(`[EmbedFileJob] Job already exists for file: ${params.fileName}`)
        return {
          job: existing,
          created: false,
          jobId,
          message: `Embedding job already exists for: ${params.fileName}`,
        }
      }
      throw error
    }
  }

  static async getStatus(filePath: string): Promise<{
    exists: boolean
    status?: string
    progress?: number
    chunks?: number
    error?: string
  }> {
    const job = await this.getByFilePath(filePath)

    if (!job) {
      return { exists: false }
    }

    const state = await job.getState()
    const data = job.data

    return {
      exists: true,
      status: data.status || state,
      progress: typeof job.progress === 'number' ? job.progress : undefined,
      chunks: data.chunks,
      error: data.error,
    }
  }
}
