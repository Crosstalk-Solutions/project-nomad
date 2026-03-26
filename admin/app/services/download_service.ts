import { inject } from '@adonisjs/core'
import { QueueService } from './queue_service.js'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadModelJob } from '#jobs/download_model_job'
import { DownloadJobWithProgress, DownloadProgressData } from '../../types/downloads.js'
import { normalize } from 'path'
import { deleteFileIfExists } from '../utils/fs.js'

@inject()
export class DownloadService {
  constructor(private queueService: QueueService) {}

  private parseProgress(progress: any): { percent: number; downloadedBytes?: number; totalBytes?: number; lastProgressTime?: number } {
    if (typeof progress === 'object' && progress !== null && 'percent' in progress) {
      const p = progress as DownloadProgressData
      return {
        percent: p.percent,
        downloadedBytes: p.downloadedBytes,
        totalBytes: p.totalBytes,
        lastProgressTime: p.lastProgressTime,
      }
    }
    // Backward compat: plain integer from in-flight jobs during upgrade
    return { percent: parseInt(String(progress), 10) || 0 }
  }

  async listDownloadJobs(filetype?: string): Promise<DownloadJobWithProgress[]> {
    // Get regular file download jobs (zim, map, etc.)
    const queue = this.queueService.getQueue(RunDownloadJob.queue)
    const fileJobs = await queue.getJobs(['waiting', 'active', 'delayed', 'failed'])

    const fileDownloads = fileJobs.map((job) => {
      const parsed = this.parseProgress(job.progress)
      return {
        jobId: job.id!.toString(),
        url: job.data.url,
        progress: parsed.percent,
        filepath: normalize(job.data.filepath),
        filetype: job.data.filetype,
        title: job.data.title || undefined,
        downloadedBytes: parsed.downloadedBytes,
        totalBytes: parsed.totalBytes || job.data.totalBytes || undefined,
        lastProgressTime: parsed.lastProgressTime,
        status: (job.failedReason ? 'failed' : 'active') as 'active' | 'failed',
        failedReason: job.failedReason || undefined,
      }
    })

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

  async removeFailedJob(jobId: string): Promise<void> {
    for (const queueName of [RunDownloadJob.queue, DownloadModelJob.queue]) {
      const queue = this.queueService.getQueue(queueName)
      const job = await queue.getJob(jobId)
      if (job) {
        await job.remove()
        return
      }
    }
  }

  async cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
    const queue = this.queueService.getQueue(RunDownloadJob.queue)
    const job = await queue.getJob(jobId)

    if (!job) {
      // Job already completed (removeOnComplete: true) or doesn't exist
      return { success: true, message: 'Job not found (may have already completed)' }
    }

    const filepath = job.data.filepath

    // Signal the worker process to abort the download via Redis
    await RunDownloadJob.signalCancel(jobId)

    // Also try in-memory abort (works if worker is in same process)
    RunDownloadJob.abortControllers.get(jobId)?.abort()
    RunDownloadJob.abortControllers.delete(jobId)

    // Give the worker a moment to pick up the cancel signal and release the job lock
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Remove the BullMQ job
    try {
      await job.remove()
    } catch {
      // Job may still be locked by worker - it will fail on next progress check
    }

    // Delete the partial file from disk
    if (filepath) {
      try {
        await deleteFileIfExists(filepath)
        // Also try .tmp in case PR #448 staging is merged
        await deleteFileIfExists(filepath + '.tmp')
      } catch {
        // File may not exist yet (waiting job)
      }
    }

    return { success: true, message: 'Download cancelled and partial file deleted' }
  }
}
