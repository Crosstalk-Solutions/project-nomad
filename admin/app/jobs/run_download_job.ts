import { Job } from 'bullmq'
import { RunDownloadJobParams } from '../../types/downloads.js'
import { QueueService } from '#services/queue_service'
import { doResumableDownload } from '../utils/downloads.js'
import { createHash } from 'crypto'
import { DockerService } from '#services/docker_service'
import { ZimService } from '#services/zim_service'
import { MapService } from '#services/map_service'

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
    const { url, filepath, timeout, allowedMimeTypes, forceNew, filetype } =
      job.data as RunDownloadJobParams

    //    console.log("Simulating delay for job for URL:", url)
    //  await new Promise((resolve) => setTimeout(resolve, 30000)) // Simulate initial delay
    //  console.log("Starting download for URL:", url)

    // // simulate progress updates for demonstration
    // for (let progress = 0; progress <= 100; progress += 10) {
    //   await new Promise((resolve) => setTimeout(resolve, 20000)) // Simulate time taken for each progress step
    //   job.updateProgress(progress)
    //   console.log(`Job progress for URL ${url}: ${progress}%`)
    // }

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
          if (filetype === 'zim') {
            const dockerService = new DockerService()
            const zimService = new ZimService(dockerService)
            await zimService.downloadRemoteSuccessCallback([url], true)
          } else if (filetype === 'map') {
            const mapsService = new MapService()
            await mapsService.downloadRemoteSuccessCallback([url], false)
          }
        } catch (error) {
          console.error(
            `[RunDownloadJob] Error in ZIM download success callback for URL ${url}:`,
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
