import { Job } from 'bullmq'
import { RunDownloadJobParams } from '../../types/downloads.js'
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

  static getJobId(url: string): string {
    return createHash('sha256').update(url).digest('hex').slice(0, 16)
  }

  async handle(job: Job) {
    const { url, filepath, timeout, allowedMimeTypes, forceNew, filetype, resourceMetadata } =
      job.data as RunDownloadJobParams

    await doResumableDownload({
      url,
      filepath,
      timeout,
      allowedMimeTypes,
      forceNew,
      onProgress(progress) {
        const progressPercent = (progress.downloadedBytes / (progress.totalBytes || 1)) * 100
        job.updateProgress(Math.floor(progressPercent))
      },
      async onComplete(url) {
        try {
          // Create InstalledResource entry if metadata was provided
          if (resourceMetadata) {
            const { default: InstalledResource } = await import('#models/installed_resource')
            const { DateTime } = await import('luxon')
            const { getFileStatsIfExists } = await import('../utils/fs.js')
            const stats = await getFileStatsIfExists(filepath)

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
          }

          if (filetype === 'zim') {
            const dockerService = new DockerService()
            const zimService = new ZimService(dockerService)
            await zimService.downloadRemoteSuccessCallback([url], true)

            // Dispatch an embedding job for the downloaded ZIM file
            try {
              await EmbedFileJob.dispatch({
                fileName: url.split('/').pop() || '',
                filePath: filepath,
              })
            } catch (error) {
              console.error(`[RunDownloadJob] Error dispatching EmbedFileJob for URL ${url}:`, error)
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
        job.updateProgress(100)
      },
    })

    return {
      url,
      filepath,
    }
  }

  static async getByUrl(url: string): Promise<Job | undefined> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(url)
    return await queue.getJob(jobId)
  }

  static async dispatch(params: RunDownloadJobParams) {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(params.url)

    try {
      const job = await queue.add(this.key, params, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
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
