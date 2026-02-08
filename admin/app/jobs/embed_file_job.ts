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
  // Batch processing for large ZIM files
  batchOffset?: number  // Current batch offset (for ZIM files)
  totalArticles?: number // Total articles in ZIM (for progress tracking)
  isFinalBatch?: boolean // Whether this is the last batch (prevents premature deletion)
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
    const { filePath, fileName, batchOffset, totalArticles } = job.data as EmbedFileJobParams

    const isZimBatch = batchOffset !== undefined
    const batchInfo = isZimBatch ? ` (batch offset: ${batchOffset})` : ''
    logger.info(`[EmbedFileJob] Starting embedding process for: ${fileName}${batchInfo}`)

    const dockerService = new DockerService()
    const ollamaService = new OllamaService()
    const ragService = new RagService(dockerService, ollamaService)

    try {
      // Check if Ollama and Qdrant services are ready
      const existingModels = await ollamaService.getModels()
      if (!existingModels) {
        logger.warn('[EmbedFileJob] Ollama service not ready yet. Will retry...')
        throw new Error('Ollama service not ready yet')
      }

      const qdrantUrl = await dockerService.getServiceURL('nomad_qdrant')
      if (!qdrantUrl) {
        logger.warn('[EmbedFileJob] Qdrant service not ready yet. Will retry...')
        throw new Error('Qdrant service not ready yet')
      }

      logger.info(`[EmbedFileJob] Services ready. Processing file: ${fileName}`)

      // Update progress starting
      await job.updateProgress(0)
      await job.updateData({
        ...job.data,
        status: 'processing',
        startedAt: job.data.startedAt || Date.now(),
      })

      logger.info(`[EmbedFileJob] Processing file: ${filePath}`)

      // Process and embed the file
      // Only allow deletion if explicitly marked as final batch
      const allowDeletion = job.data.isFinalBatch === true
      const result = await ragService.processAndEmbedFile(
        filePath,
        allowDeletion,
        batchOffset
      )

      if (!result.success) {
        logger.error(`[EmbedFileJob] Failed to process file ${fileName}: ${result.message}`)
        throw new Error(result.message)
      }

      // For ZIM files with batching, check if more batches are needed
      if (result.hasMoreBatches) {
        const nextOffset = (batchOffset || 0) + (result.articlesProcessed || 0)
        logger.info(
          `[EmbedFileJob] Batch complete. Dispatching next batch at offset ${nextOffset}`
        )

        // Dispatch next batch (not final yet)
        await EmbedFileJob.dispatch({
          filePath,
          fileName,
          batchOffset: nextOffset,
          totalArticles: totalArticles || result.totalArticles,
          isFinalBatch: false, // Explicitly not final
        })

        // Calculate progress based on articles processed
        const progress = totalArticles
          ? Math.round((nextOffset / totalArticles) * 100)
          : 50

        await job.updateProgress(progress)
        await job.updateData({
          ...job.data,
          status: 'batch_completed',
          lastBatchAt: Date.now(),
          chunks: (job.data.chunks || 0) + (result.chunks || 0),
        })

        return {
          success: true,
          fileName,
          filePath,
          chunks: result.chunks,
          hasMoreBatches: true,
          nextOffset,
          message: `Batch embedded ${result.chunks} chunks, next batch queued`,
        }
      }

      // Final batch or non-batched file - mark as complete
      const totalChunks = (job.data.chunks || 0) + (result.chunks || 0)
      await job.updateProgress(100)
      await job.updateData({
        ...job.data,
        status: 'completed',
        completedAt: Date.now(),
        chunks: totalChunks,
      })

      const batchMsg = isZimBatch ? ` (final batch, total chunks: ${totalChunks})` : ''
      logger.info(
        `[EmbedFileJob] Successfully embedded ${result.chunks} chunks from file: ${fileName}${batchMsg}`
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
        attempts: 30,
        backoff: {
          type: 'fixed',
          delay: 60000, // Check every 60 seconds for service readiness
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
