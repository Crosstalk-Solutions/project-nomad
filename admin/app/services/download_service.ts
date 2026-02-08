import { inject } from '@adonisjs/core'
import { QueueService } from './queue_service.js'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadModelJob } from '#jobs/download_model_job'
import { DownloadJobWithProgress } from '../../types/downloads.js'
import { normalize } from 'path'

@inject()
export class DownloadService {
  constructor(private queueService: QueueService) {}

  async listDownloadJobs(filetype?: string): Promise<DownloadJobWithProgress[]> {
    // Get regular file download jobs (zim, map, etc.)
    const queue = this.queueService.getQueue(RunDownloadJob.queue)
    const fileJobs = await queue.getJobs(['waiting', 'active', 'delayed'])

    const fileDownloads = fileJobs.map((job) => ({
      jobId: job.id!.toString(),
      url: job.data.url,
      progress: parseInt(job.progress.toString(), 10),
      filepath: normalize(job.data.filepath),
      filetype: job.data.filetype,
    }))

    // Get Ollama model download jobs
    const modelQueue = this.queueService.getQueue(DownloadModelJob.queue)
    const modelJobs = await modelQueue.getJobs(['waiting', 'active', 'delayed'])

    const modelDownloads = modelJobs.map((job) => ({
      jobId: job.id!.toString(),
      url: job.data.modelName || 'Unknown Model', // Use model name as url
      progress: parseInt(job.progress.toString(), 10),
      filepath: job.data.modelName || 'Unknown Model', // Use model name as filepath
      filetype: 'model',
    }))

    const allDownloads = [...fileDownloads, ...modelDownloads]

    // Filter by filetype if specified
    const filtered = allDownloads.filter((job) => !filetype || job.filetype === filetype)

    // Sort so actively downloading items (progress > 0) appear first, then by progress descending
    return filtered.sort((a, b) => b.progress - a.progress)
  }
}
