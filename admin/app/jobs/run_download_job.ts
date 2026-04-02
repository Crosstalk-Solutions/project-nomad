import { Job, UnrecoverableError } from 'bullmq'
import { RunDownloadJobParams, DownloadProgressData } from '../../types/downloads.js'
import { QueueService } from '#services/queue_service'
import { doResumableDownload } from '../utils/downloads.js'
import { createHash } from 'crypto'
import { DockerService } from '#services/docker_service'
import { ZimService } from '#services/zim_service'
import { MapService } from '#services/map_service'
import { EmbedFileJob } from './embed_file_job.js'

export class RunDownloadJob {
  static get queue() {
    return 'downloads'
  }

  static get key() {
    return 'run-download'
  }

  /** In-memory registry of abort controllers for active download jobs */
  static abortControllers: Map<string, AbortController> = new Map()

  static getJobId(url: string): string {
    return createHash('sha256').update(url).digest('hex').slice(0, 16)
  }

  /** Redis key used to signal cancellation across processes */
  static cancelKey(jobId: string): string {
    return `nomad:download:cancel:${jobId}`
  }

  /** Signal cancellation via Redis so the worker process can pick it up */
  static async signalCancel(jobId: string): Promise<void> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const client = await queue.client
    await client.set(this.cancelKey(jobId), '1', 'EX', 300) // 5 min TTL
  }

  async handle(job: Job) {
    const { url, filepath, timeout, allowedMimeTypes, forceNew, filetype, resourceMetadata } =
      job.data as RunDownloadJobParams

    // Register abort controller for this job
    const abortController = new AbortController()
    RunDownloadJob.abortControllers.set(job.id!, abortController)

    // Get Redis client for checking cancel signals from the API process
    const queueService = new QueueService()
    const cancelRedis = await queueService.getQueue(RunDownloadJob.queue).client

    let lastKnownProgress: Pick<DownloadProgressData, 'downloadedBytes' | 'totalBytes'> = {
      downloadedBytes: 0,
      totalBytes: 0,
    }

    // Poll Redis for cancel signal every 2s — independent of progress events so cancellation
    // works even when the stream is stalled and no onProgress ticks are firing.
    let cancelPollInterval: ReturnType<typeof setInterval> | null = setInterval(async () => {
      try {
        const val = await cancelRedis.get(RunDownloadJob.cancelKey(job.id!))
        if (val) {
          await cancelRedis.del(RunDownloadJob.cancelKey(job.id!))
          abortController.abort()
        }
      } catch {
        // Redis errors are non-fatal; in-process AbortController covers same-process cancels
      }
    }, 2000)

    try {
      await doResumableDownload({
        url,
        filepath,
        timeout,
        allowedMimeTypes,
        forceNew,
        signal: abortController.signal,
        onProgress(progress) {
          const progressPercent = (progress.downloadedBytes / (progress.totalBytes || 1)) * 100
          const progressData: DownloadProgressData = {
            percent: Math.floor(progressPercent),
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
            lastProgressTime: Date.now(),
          }
          job.updateProgress(progressData).catch((err) => {
            // Job was removed from Redis (e.g. cancelled) between the callback firing
            // and the Redis write completing — this is expected and safe to ignore.
            if (err?.code !== -1) throw err
          })
          lastKnownProgress = { downloadedBytes: progress.downloadedBytes, totalBytes: progress.totalBytes }
        },
        async onComplete(url) {
          try {
            // Create InstalledResource entry if metadata was provided
            if (resourceMetadata) {
              const { default: InstalledResource } = await import('#models/installed_resource')
              const { DateTime } = await import('luxon')
              const { getFileStatsIfExists, deleteFileIfExists } = await import('../utils/fs.js')
              const stats = await getFileStatsIfExists(filepath)

              // Look up the old entry so we can clean up the previous file after updating
              const oldEntry = await InstalledResource.query()
                .where('resource_id', resourceMetadata.resource_id)
                .where('resource_type', filetype as 'zim' | 'map')
                .first()
              const oldFilePath = oldEntry?.file_path ?? null

              await InstalledResource.updateOrCreate(
                { resource_id: resourceMetadata.resource_id, resource_type: filetype as 'zim' | 'map' },
                {
                  version: resourceMetadata.version,
                  collection_ref: resourceMetadata.collection_ref,
                  url: url,
                  file_path: filepath,
                  file_size_bytes: stats ? Number(stats.size) : null,
                  installed_at: DateTime.now(),
                }
              )

              // Delete the old file if it differs from the new one
              if (oldFilePath && oldFilePath !== filepath) {
                try {
                  await deleteFileIfExists(oldFilePath)
                  console.log(`[RunDownloadJob] Deleted old file: ${oldFilePath}`)
                } catch (deleteError) {
                  console.warn(
                    `[RunDownloadJob] Failed to delete old file ${oldFilePath}:`,
                    deleteError
                  )
                }
              }
            }

            if (filetype === 'zim') {
              const dockerService = new DockerService()
              const zimService = new ZimService(dockerService)
              await zimService.downloadRemoteSuccessCallback([url], true)

              // Only dispatch embedding job if AI Assistant (Ollama) is installed
              const ollamaUrl = await dockerService.getServiceURL('nomad_ollama')
              if (ollamaUrl) {
                try {
                  await EmbedFileJob.dispatch({
                    fileName: url.split('/').pop() || '',
                    filePath: filepath,
                  })
                } catch (error) {
                  console.error(`[RunDownloadJob] Error dispatching EmbedFileJob for URL ${url}:`, error)
                }
              }
            } else if (filetype === 'map') {
              const mapsService = new MapService()
              await mapsService.downloadRemoteSuccessCallback([url], false)
            }
          } catch (error) {
            console.error(
              `[RunDownloadJob] Error in download success callback for URL ${url}:`,
              error
            )
          }
          job.updateProgress({
            percent: 100,
            downloadedBytes: lastKnownProgress.downloadedBytes,
            totalBytes: lastKnownProgress.totalBytes,
            lastProgressTime: Date.now(),
          } as DownloadProgressData).catch((err) => {
            if (err?.code !== -1) throw err
          })
        },
      })

      return {
        url,
        filepath,
      }
    } catch (error: any) {
      // If this was a cancellation abort, don't let BullMQ retry
      if (error?.message?.includes('aborted') || error?.message?.includes('cancelled')) {
        throw new UnrecoverableError(`Download cancelled: ${error.message}`)
      }
      throw error
    } finally {
      if (cancelPollInterval !== null) {
        clearInterval(cancelPollInterval)
        cancelPollInterval = null
      }
      RunDownloadJob.abortControllers.delete(job.id!)
    }
  }

  static async getByUrl(url: string): Promise<Job | undefined> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(url)
    return await queue.getJob(jobId)
  }

  /**
   * Check if a download is actively in progress for the given URL.
   * Returns the job only if it's in an active state (active, waiting, delayed).
   * If the job exists in a terminal state (failed, completed), removes it and returns undefined.
   */
  static async getActiveByUrl(url: string): Promise<Job | undefined> {
    const job = await this.getByUrl(url)
    if (!job) return undefined

    const state = await job.getState()
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      return job
    }

    // Terminal state -- clean up stale job so it doesn't block re-download
    try {
      await job.remove()
    } catch {
      // May already be gone
    }
    return undefined
  }

  static async dispatch(params: RunDownloadJobParams) {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(params.url)

    try {
      const job = await queue.add(this.key, params, {
        jobId,
        attempts: 10,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
      })

      return {
        job,
        created: true,
        message: `Dispatched download job for URL ${params.url}`,
      }
    } catch (error) {
      if (error.message.includes('job already exists')) {
        const existing = await queue.getJob(jobId)
        return {
          job: existing,
          created: false,
          message: `Job already exists for URL ${params.url}`,
        }
      }
      throw error
    }
  }
}
