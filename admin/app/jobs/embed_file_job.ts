import { Job, UnrecoverableError } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { EmbedJobWithProgress } from '../../types/rag.js'
import { RagService } from '#services/rag_service'
import { DockerService } from '#services/docker_service'
import { OllamaService } from '#services/ollama_service'
import KbIngestState from '#models/kb_ingest_state'
import { createHash } from 'crypto'
import logger from '@adonisjs/core/services/logger'
import fs from 'node:fs/promises'
import { ZIM_BATCH_SIZE } from '../../constants/zim_extraction.js'

export interface EmbedFileJobParams {
  filePath: string
  fileName: string
  fileSize?: number
  // Batch processing for large ZIM files
  batchOffset?: number  // Current batch offset (for ZIM files)
  totalArticles?: number // Total articles in ZIM (for progress tracking)
  isFinalBatch?: boolean // Whether this is the last batch (prevents premature deletion)
  // Running total of chunks embedded across prior batches in this dispatch chain.
  // Carried forward so the final batch can persist an accurate `chunks_embedded`
  // count via KbIngestState.markIndexed (see #933 — without this, only the last
  // batch's chunk count was stored while Qdrant held the full set).
  chunksSoFar?: number
}

export class EmbedFileJob {
  static get queue() {
    return 'file-embeddings'
  }

  static get key() {
    return 'embed-file'
  }

  // Delay between continuation batches when embedding runs CPU-only. Gives the OS
  // scheduler a brief idle window so sshd / disk-collector / other services don't
  // starve during long multi-batch ZIM ingestions. Skipped entirely when the
  // embedding model is GPU-offloaded — see OllamaService.isEmbeddingGpuAccelerated().
  static readonly CPU_BATCH_DELAY_MS = 1000

  static getJobId(filePath: string): string {
    return createHash('sha256').update(filePath).digest('hex').slice(0, 16)
  }

  /** Calls job.updateProgress but silently ignores "Missing key" errors (code -1),
   *  which occur when the job has been removed from Redis (e.g. cancelled externally)
   *  between the time the await was issued and the Redis write completed. */
  private async safeUpdateProgress(job: Job, progress: number): Promise<void> {
    try {
      await job.updateProgress(progress)
    } catch (err: any) {
      if (err?.code !== -1) throw err
    }
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
      // Check if Ollama and Qdrant services are installed and ready
      // Use UnrecoverableError for "not installed" so BullMQ won't retry —
      // retrying 30x when the service doesn't exist just wastes Redis connections
      const ollamaUrl = await dockerService.getServiceURL('nomad_ollama')
      if (!ollamaUrl) {
        logger.warn('[EmbedFileJob] Ollama is not installed. Skipping embedding for: %s', fileName)
        throw new UnrecoverableError('Ollama service is not installed. Install AI Assistant to enable file embeddings.')
      }

      const existingModels = await ollamaService.getModels()
      if (!existingModels) {
        logger.warn('[EmbedFileJob] Ollama service not ready yet. Will retry...')
        throw new Error('Ollama service not ready yet')
      }

      const qdrantUrl = await dockerService.getServiceURL('nomad_qdrant')
      if (!qdrantUrl) {
        logger.warn('[EmbedFileJob] Qdrant is not installed. Skipping embedding for: %s', fileName)
        throw new UnrecoverableError('Qdrant service is not installed. Install AI Assistant to enable file embeddings.')
      }

      logger.info(`[EmbedFileJob] Services ready. Processing file: ${fileName}`)

      // Anchor initial progress to where we are in the overall file. For a
      // continuation batch midway through a multi-batch ZIM (e.g. offset 100k of
      // 600k), the hardcoded 5 used to make the gauge briefly flash 0→5→real,
      // which read as a backward jump. Fall back to 5 for single-batch files
      // where totalArticles isn't set.
      const initialPercent =
        totalArticles && totalArticles > 0
          ? Math.min(99, Math.round(((batchOffset || 0) / totalArticles) * 100))
          : 5
      await this.safeUpdateProgress(job, initialPercent)
      await job.updateData({
        ...job.data,
        status: 'processing',
        startedAt: job.data.startedAt || Date.now(),
      })

      logger.info(`[EmbedFileJob] Processing file: ${filePath}`)

      // Progress callback. For multi-batch ZIM ingestions, scale the service-reported
      // 0-100% (which is % through the current batch's chunks) into the overall-file
      // frame so the UI gauge climbs monotonically across the many continuation jobs
      // BullMQ creates per file. Without this, every new continuation jobId resets the
      // gauge to ~5% and the user sees ingestion progress "jumping around" between
      // each batch's local frame and the end-of-batch overall-file overwrite below.
      //
      // For single-batch files (uploaded PDFs, txts) totalArticles is undefined and
      // we fall back to the original 5-95% per-job range, which is what the UI expects
      // for a one-shot file with no continuations.
      const onProgress = async (percent: number) => {
        const useOverallFrame = totalArticles && totalArticles > 0
        if (useOverallFrame) {
          const articlesDone = (batchOffset || 0) + (percent / 100) * ZIM_BATCH_SIZE
          const overallPercent = Math.min(99, Math.round((articlesDone / totalArticles) * 100))
          await this.safeUpdateProgress(job, overallPercent)
        } else {
          await this.safeUpdateProgress(job, Math.min(95, Math.round(5 + percent * 0.9)))
        }
      }

      // Process and embed the file
      // Only allow deletion if explicitly marked as final batch
      const allowDeletion = job.data.isFinalBatch === true
      const result = await ragService.processAndEmbedFile(
        filePath,
        allowDeletion,
        batchOffset,
        onProgress
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

        // Pace continuation batches when embedding is CPU-bound. Sustained 100% CPU
        // saturation across all cores during multi-batch ZIM ingestion can starve
        // other services (sshd has been seen to lose responsiveness hard enough to
        // require a power-cycle). When GPU-accelerated, embeddings stream through
        // the GPU and CPUs stay free — no pacing needed.
        const isGpuAccelerated = await ollamaService.isEmbeddingGpuAccelerated()
        if (!isGpuAccelerated) {
          logger.info(
            `[EmbedFileJob] Embedding is CPU-only — pacing ${EmbedFileJob.CPU_BATCH_DELAY_MS}ms before dispatching next batch`
          )
          await new Promise((resolve) => setTimeout(resolve, EmbedFileJob.CPU_BATCH_DELAY_MS))
        }

        // Dispatch next batch (not final yet). Carry forward the running
        // chunk count so the final batch can persist an accurate total (#933).
        const chunksSoFarNext = (job.data.chunksSoFar || 0) + (result.chunks || 0)
        await EmbedFileJob.dispatch({
          filePath,
          fileName,
          batchOffset: nextOffset,
          totalArticles: totalArticles || result.totalArticles,
          isFinalBatch: false, // Explicitly not final
          chunksSoFar: chunksSoFarNext,
        })

        // Calculate progress based on articles processed.
        //
        // nextOffset counts entries passing our isArticleEntry() filter, but the
        // denominator (totalArticles = archive.articleCount) uses libzim's
        // narrower article definition. On ZIMs that pack one logical article as
        // several sub-pages (e.g. iFixit), nextOffset outruns articleCount and a
        // raw ratio overflows past 100%, which the UI pins at 99% for the entire
        // tail so the file looks stuck (#903). Grow the denominator once we pass
        // the reported count so the gauge keeps creeping forward monotonically,
        // and never report 100% before the genuinely-final batch (handled below).
        const progress = totalArticles
          ? Math.min(99, Math.round((nextOffset / Math.max(totalArticles, nextOffset + ZIM_BATCH_SIZE)) * 100))
          : 50

        await this.safeUpdateProgress(job, progress)
        await job.updateData({
          ...job.data,
          status: 'batch_completed',
          lastBatchAt: Date.now(),
          chunks: chunksSoFarNext,
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

      // Final batch or non-batched file - mark as complete.
      // chunksSoFar carries the accumulated count from prior dispatched batches
      // (each continuation passes it forward — see EmbedFileJobParams). For a
      // non-batched file it is undefined and we just count this single result.
      const totalChunks = (job.data.chunksSoFar || 0) + (result.chunks || 0)
      await this.safeUpdateProgress(job, 100)
      await job.updateData({
        ...job.data,
        status: 'completed',
        completedAt: Date.now(),
        chunks: totalChunks,
      })

      // Persist the post-job state so scanAndSyncStorage knows this file is done.
      // BullMQ's :completed retention (50 jobs) ages out, so the state row is
      // the only durable record of "this file finished embedding".
      try {
        await KbIngestState.markIndexed(filePath, totalChunks)
      } catch (stateErr) {
        logger.warn(
          `[EmbedFileJob] Failed to persist ingest state for ${fileName}: %s`,
          stateErr instanceof Error ? stateErr.message : String(stateErr)
        )
      }

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
      // A chunk that still exceeds the model's context after OllamaService's truncate-and-retry is
      // permanently oversized for this install (e.g. a model whose context is smaller than our safe
      // cap). Re-embedding the whole file 30x re-processes everything and can never succeed — that is
      // the "endless queue loop" / "api/embed for weeks" (#881/#944/#959). Mark it unrecoverable so
      // BullMQ stops after one pass instead of storming.
      let normalizedError = error
      if (!(error instanceof UnrecoverableError) && OllamaService.isContextLengthError(error)) {
        logger.warn(
          `[EmbedFileJob] Context-length overflow persisted for ${fileName} after truncation; not retrying.`
        )
        normalizedError = new UnrecoverableError(
          error instanceof Error ? error.message : 'Embedding input exceeds the model context length'
        )
      }

      logger.error(`[EmbedFileJob] Error embedding file ${fileName}:`, normalizedError)

      await job.updateData({
        ...job.data,
        status: 'failed',
        failedAt: Date.now(),
        error: normalizedError instanceof Error ? normalizedError.message : 'Unknown error',
      })

      // Only persist `failed` for unrecoverable errors. Retryable errors get
      // automatic BullMQ retries (30 attempts); marking state failed on every
      // transient blip would suppress the retry-driven recovery path.
      if (normalizedError instanceof UnrecoverableError) {
        try {
          await KbIngestState.markFailed(
            filePath,
            normalizedError instanceof Error ? normalizedError.message : 'Unknown error'
          )
        } catch (stateErr) {
          logger.warn(
            `[EmbedFileJob] Failed to persist failed state for ${fileName}: %s`,
            stateErr instanceof Error ? stateErr.message : String(stateErr)
          )
        }
      }

      throw normalizedError
    }
  }

  static async listActiveJobs(): Promise<EmbedJobWithProgress[]> {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed'])

    return jobs.map((job) => {
      const data = job.data as EmbedFileJobParams & {
        status?: string
        lastBatchAt?: number
        startedAt?: number
        chunks?: number
      }
      return {
        jobId: job.id!.toString(),
        fileName: data.fileName,
        filePath: data.filePath,
        progress: typeof job.progress === 'number' ? job.progress : 0,
        status: data.status ?? 'waiting',
        lastBatchAt: data.lastBatchAt,
        startedAt: data.startedAt,
        chunks: data.chunks,
      }
    })
  }

  static async getByFilePath(filePath: string): Promise<Job | undefined> {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(filePath)
    return await queue.getJob(jobId)
  }

  static async dispatch(params: EmbedFileJobParams, options?: { force?: boolean }) {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    // Continuation batches (batchOffset > 0) must NOT reuse the deterministic
    // per-file jobId. Two BullMQ dedupe paths would otherwise silently swallow them:
    //   1) The parent batch's handle() calls dispatch() before returning, so the
    //      parent job is still `active` and locked — queue.add() with the same
    //      jobId returns the locked parent rather than enqueueing the new batch.
    //   2) After the parent completes, its entry stays in `completed` (held by
    //      `removeOnComplete: { count: 50 }`), still tripping jobId dedupe.
    // Letting BullMQ auto-generate a unique jobId for continuation batches stacks
    // them as independent queue entries that each process via handle().
    // Initial dispatches keep the deterministic jobId so re-triggering an install
    // (UI re-click, sync rescan, etc.) is still idempotent.
    // `force` skips the deterministic jobId for bulk callers (reembedAll /
    // resetAndRebuild) where historical entries in :completed would otherwise
    // silently swallow the new dispatch.
    const isContinuation = !!(params.batchOffset && params.batchOffset > 0)
    const force = !!options?.force
    const initialJobId = this.getJobId(params.filePath)

    const jobOptions: Parameters<typeof queue.add>[2] = {
      attempts: 30,
      backoff: {
        type: 'fixed',
        delay: 60000, // Check every 60 seconds for service readiness
      },
      removeOnComplete: { count: 50 }, // Keep last 50 completed jobs for history
      removeOnFail: { count: 20 }, // Keep last 20 failed jobs for debugging
    }
    if (!isContinuation && !force) {
      jobOptions.jobId = initialJobId
    }

    try {
      const job = await queue.add(this.key, params, jobOptions)

      const label = isContinuation
        ? ` (continuation @ offset ${params.batchOffset})`
        : force
          ? ' (forced re-dispatch)'
          : ''
      logger.info(
        `[EmbedFileJob] Dispatched embedding job for file: ${params.fileName}${label}`
      )

      return {
        job,
        created: true,
        jobId: job.id ?? initialJobId,
        message: `File queued for embedding: ${params.fileName}`,
      }
    } catch (error) {
      if (
        !isContinuation &&
        !force &&
        error.message &&
        error.message.includes('job already exists')
      ) {
        const existing = await queue.getJob(initialJobId)
        logger.info(`[EmbedFileJob] Job already exists for file: ${params.fileName}`)
        return {
          job: existing,
          created: false,
          jobId: initialJobId,
          message: `Embedding job already exists for: ${params.fileName}`,
        }
      }
      throw error
    }
  }

  static async listFailedJobs(): Promise<EmbedJobWithProgress[]> {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)
    // Jobs that have failed at least once are in 'delayed' (retrying) or terminal 'failed' state.
    // We identify them by job.data.status === 'failed' set in the catch block of handle().
    const jobs = await queue.getJobs(['waiting', 'delayed', 'failed'])

    return jobs
      .filter((job) => (job.data as any).status === 'failed')
      .map((job) => ({
        jobId: job.id!.toString(),
        fileName: (job.data as EmbedFileJobParams).fileName,
        filePath: (job.data as EmbedFileJobParams).filePath,
        progress: 0,
        status: 'failed',
        error: (job.data as any).error,
      }))
  }

  static async cleanupFailedJobs(): Promise<{ cleaned: number; filesDeleted: number }> {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)
    const allJobs = await queue.getJobs(['waiting', 'delayed', 'failed'])
    const failedJobs = allJobs.filter((job) => (job.data as any).status === 'failed')

    let cleaned = 0
    let filesDeleted = 0

    for (const job of failedJobs) {
      const filePath = (job.data as EmbedFileJobParams).filePath
      if (filePath && filePath.includes(RagService.UPLOADS_STORAGE_PATH)) {
        try {
          await fs.unlink(filePath)
          filesDeleted++
        } catch {
          // File may already be deleted — that's fine
        }
      }
      await job.remove()
      cleaned++
    }

    logger.info(`[EmbedFileJob] Cleaned up ${cleaned} failed jobs, deleted ${filesDeleted} files`)
    return { cleaned, filesDeleted }
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
