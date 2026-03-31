import { inject } from '@adonisjs/core'
import { QueueService } from './queue_service.js'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadModelJob } from '#jobs/download_model_job'
import { DownloadJobWithProgress } from '../../types/downloads.js'
import WikipediaSelection from '#models/wikipedia_selection'
import { normalize } from 'path'

@inject()
export class DownloadService {
  constructor(private queueService: QueueService) {}

  async listDownloadJobs(filetype?: string): Promise<DownloadJobWithProgress[]> {
    // Get regular file download jobs (zim, map, etc.)
    const queue = this.queueService.getQueue(RunDownloadJob.queue)
    const fileJobs = await queue.getJobs(['waiting', 'active', 'delayed', 'failed'])

    const fileDownloads = fileJobs.map((job) => ({
      jobId: job.id!.toString(),
      url: job.data.url,
      progress: parseInt(job.progress.toString(), 10),
      filepath: normalize(job.data.filepath),
      filetype: job.data.filetype,
      status: (job.failedReason ? 'failed' : 'active') as 'active' | 'failed',
      failedReason: job.failedReason || undefined,
    }))

    // Get Ollama model download jobs
    const modelQueue = this.queueService.getQueue(DownloadModelJob.queue)
    const modelJobs = await modelQueue.getJobs(['waiting', 'active', 'delayed', 'failed'])

    const modelDownloads = modelJobs.map((job) => ({
      jobId: job.id!.toString(),
      url: job.data.modelName || 'Unknown Model', // Use model name as url
      progress: parseInt(job.progress.toString(), 10),
      filepath: job.data.modelName || 'Unknown Model', // Use model name as filepath
      filetype: 'model',
      status: (job.failedReason ? 'failed' : 'active') as 'active' | 'failed',
      failedReason: job.failedReason || undefined,
    }))

    const allDownloads = [...fileDownloads, ...modelDownloads]

    // Filter by filetype if specified
    const filtered = allDownloads.filter((job) => !filetype || job.filetype === filetype)

    // Sort: active downloads first (by progress desc), then failed at the bottom
    return filtered.sort((a, b) => {
      if (a.status === 'failed' && b.status !== 'failed') return 1
      if (a.status !== 'failed' && b.status === 'failed') return -1
      return b.progress - a.progress
    })
  }

  async removeJob(jobId: string): Promise<void> {
    for (const queueName of [RunDownloadJob.queue, DownloadModelJob.queue]) {
      const queue = this.queueService.getQueue(queueName)
      const job = await queue.getJob(jobId)
      if (job) {
        // If this is a Wikipedia download, reset the selection status
        const jobUrl = job.data?.url || ''
        if (jobUrl.includes('wikipedia')) {
          const selection = await WikipediaSelection.query()
            .where('url', jobUrl)
            .where('status', 'downloading')
            .first()
          if (selection) {
            selection.status = 'none'
            selection.url = null
            selection.filename = null
            await selection.save()
          }
        }

        try {
          await job.discard()
        } catch {
          // Job may already be in a terminal state
        }

        try {
          await job.remove()
        } catch {
          try {
            await job.moveToFailed(new Error('Cancelled'), '0', false)
          } catch {
            // Already in failed state or lock contention
          }
          try {
            await job.remove()
          } catch {
            // Lock still held — will be removable on next attempt
          }
        }
        return
      }
    }
  }
}
