import { inject } from '@adonisjs/core'
import { QueueService } from './queue_service.js'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadJobWithProgress } from '../../types/downloads.js'
import { normalize } from 'path'

@inject()
export class DownloadService {
  constructor(private queueService: QueueService) {}

  async listDownloadJobs(filetype?: string): Promise<DownloadJobWithProgress[]> {
    const queue = this.queueService.getQueue(RunDownloadJob.queue)
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed'])

    return jobs
      .map((job) => ({
        jobId: job.id!.toString(),
        url: job.data.url,
        progress: parseInt(job.progress.toString(), 10),
        filepath: normalize(job.data.filepath),
        filetype: job.data.filetype,
      }))
      .filter((job) => !filetype || job.filetype === filetype)
  }
}
