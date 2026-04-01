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
    // Get regular file download jobs (zim, map, etc.) — query each state separately so we can
    // tag each job with its actual BullMQ state rather than guessing from progress data.
    const queue = this.queueService.getQueue(RunDownloadJob.queue)
    type FileJobState = 'waiting' | 'active' | 'delayed' | 'failed'

    const [waitingJobs, activeJobs, delayedJobs, failedJobs] = await Promise.all([
      queue.getJobs(['waiting']),
      queue.getJobs(['active']),
      queue.getJobs(['delayed']),
      queue.getJobs(['failed']),
    ])

    const taggedFileJobs: Array<{ job: (typeof waitingJobs)[0]; state: FileJobState }> = [
      ...waitingJobs.map((j) => ({ job: j, state: 'waiting' as const })),
      ...activeJobs.map((j) => ({ job: j, state: 'active' as const })),
      ...delayedJobs.map((j) => ({ job: j, state: 'delayed' as const })),
      ...failedJobs.map((j) => ({ job: j, state: 'failed' as const })),
    ]

    const fileDownloads = taggedFileJobs.map(({ job, state }) => {
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
        status: state,
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
        try {
          await job.remove()
        } catch {
          // Job may be locked by the worker after cancel. Remove the stale lock and retry.
          try {
            const client = await queue.client
            await client.del(`bull:${queueName}:${jobId}:lock`)
            await job.remove()
          } catch {
            // Last resort: already removed or truly stuck
          }
        }
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

    // Poll for terminal state (up to 4s at 250ms intervals) — cooperates with BullMQ's lifecycle
    // instead of force-removing an active job and losing the worker's failure/cleanup path.
    const POLL_INTERVAL_MS = 250
    const POLL_TIMEOUT_MS = 4000
    const deadline = Date.now() + POLL_TIMEOUT_MS
    let reachedTerminal = false

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      try {
        const state = await job.getState()
        if (state === 'failed' || state === 'completed' || state === 'unknown') {
          reachedTerminal = true
          break
        }
      } catch {
        reachedTerminal = true // getState() throws if job is already gone
        break
      }
    }

    if (!reachedTerminal) {
      console.warn(`[DownloadService] cancelJob: job ${jobId} did not reach terminal state within timeout, removing anyway`)
    }

    // Remove the BullMQ job
    try {
      await job.remove()
    } catch {
      // Lock contention fallback: clear lock and retry once
      try {
        const client = await queue.client
        await client.del(`bull:${RunDownloadJob.queue}:${jobId}:lock`)
        const updatedJob = await queue.getJob(jobId)
        if (updatedJob) await updatedJob.remove()
      } catch {
        // Best effort - job will be cleaned up on next dismiss attempt
      }
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

    // If this was a Wikipedia download, update selection status to failed
    // (the worker's failed event may not fire if we removed the job first)
    if (job.data.filetype === 'zim' && job.data.url?.includes('wikipedia_en_')) {
      try {
        const { DockerService } = await import('#services/docker_service')
        const { ZimService } = await import('#services/zim_service')
        const dockerService = new DockerService()
        const zimService = new ZimService(dockerService)
        await zimService.onWikipediaDownloadComplete(job.data.url, false)
      } catch {
        // Best effort
      }
    }

    return { success: true, message: 'Download cancelled and partial file deleted' }
  }
}
