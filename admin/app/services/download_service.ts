import { inject } from '@adonisjs/core'
import { QueueService } from './queue_service.js'
import { RunDownloadJob } from '#jobs/run_download_job'
import { RunExtractPmtilesJob } from '#jobs/run_extract_pmtiles_job'
import type { RunExtractPmtilesJobParams } from '#jobs/run_extract_pmtiles_job'
import { DownloadModelJob } from '#jobs/download_model_job'
import { DownloadJobWithProgress, DownloadProgressData } from '../../types/downloads.js'
import type { Job, Queue } from 'bullmq'
import { normalize } from 'path'
import { deleteFileIfExists } from '../utils/fs.js'
import transmit from '@adonisjs/transmit/services/main'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'

type FileJobState = 'waiting' | 'active' | 'delayed' | 'failed'
type TaggedJob = { job: Job; state: FileJobState }

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

  /** Fetch all non-completed jobs from a queue, tagged with their current BullMQ state */
  private async fetchJobsWithStates(queueName: string): Promise<TaggedJob[]> {
    const queue = this.queueService.getQueue(queueName)
    const [waiting, active, delayed, failed] = await Promise.all([
      queue.getJobs(['waiting']),
      queue.getJobs(['active']),
      queue.getJobs(['delayed']),
      queue.getJobs(['failed']),
    ])
    return [
      ...waiting.map((j) => ({ job: j, state: 'waiting' as const })),
      ...active.map((j) => ({ job: j, state: 'active' as const })),
      ...delayed.map((j) => ({ job: j, state: 'delayed' as const })),
      ...failed.map((j) => ({ job: j, state: 'failed' as const })),
    ]
  }

  async listDownloadJobs(filetype?: string): Promise<DownloadJobWithProgress[]> {
    const modelQueue = this.queueService.getQueue(DownloadModelJob.queue)
    const [fileTagged, extractTagged, modelJobs] = await Promise.all([
      this.fetchJobsWithStates(RunDownloadJob.queue),
      this.fetchJobsWithStates(RunExtractPmtilesJob.queue),
      modelQueue.getJobs(['waiting', 'active', 'delayed', 'failed']),
    ])

    const fileDownloads = fileTagged.map(({ job, state }) => {
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

    const extractDownloads = extractTagged.map(({ job, state }) => {
      const parsed = this.parseProgress(job.progress)
      return {
        jobId: job.id!.toString(),
        url: job.data.sourceUrl,
        progress: parsed.percent,
        filepath: normalize(job.data.outputFilepath),
        filetype: job.data.filetype || 'map',
        title: job.data.title || undefined,
        downloadedBytes: parsed.downloadedBytes,
        totalBytes: parsed.totalBytes || job.data.estimatedBytes || undefined,
        lastProgressTime: parsed.lastProgressTime,
        status: state,
        failedReason: job.failedReason || undefined,
      }
    })

    const modelDownloads = modelJobs.map((job) => ({
      jobId: job.id!.toString(),
      url: job.data.modelName || 'Unknown Model',
      progress: parseInt(job.progress.toString(), 10),
      filepath: job.data.modelName || 'Unknown Model',
      filetype: 'model',
      status: (job.failedReason ? 'failed' : 'active') as 'active' | 'failed',
      failedReason: job.failedReason || undefined,
    }))

    const allDownloads = [...fileDownloads, ...extractDownloads, ...modelDownloads]
    const filtered = allDownloads.filter((job) => !filetype || job.filetype === filetype)

    return filtered.sort((a, b) => {
      if (a.status === 'failed' && b.status !== 'failed') return 1
      if (a.status !== 'failed' && b.status === 'failed') return -1
      return b.progress - a.progress
    })
  }

  async removeFailedJob(jobId: string): Promise<void> {
    for (const queueName of [
      RunDownloadJob.queue,
      RunExtractPmtilesJob.queue,
      DownloadModelJob.queue,
    ]) {
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

    if (job) {
      return await this._cancelFileDownloadJob(jobId, job, queue)
    }

    const extractQueue = this.queueService.getQueue(RunExtractPmtilesJob.queue)
    const extractJob = await extractQueue.getJob(jobId)

    if (extractJob) {
      return await this._cancelExtractJob(jobId, extractJob, extractQueue)
    }

    const modelQueue = this.queueService.getQueue(DownloadModelJob.queue)
    const modelJob = await modelQueue.getJob(jobId)

    if (modelJob) {
      return await this._cancelModelDownloadJob(jobId, modelJob, modelQueue)
    }

    return { success: true, message: 'Job not found (may have already completed)' }
  }

  private async _cancelExtractJob(
    jobId: string,
    job: Job<RunExtractPmtilesJobParams>,
    queue: Queue<RunExtractPmtilesJobParams>
  ): Promise<{ success: boolean; message: string }> {
    const outputFilepath = job.data.outputFilepath

    await RunExtractPmtilesJob.signalCancel(jobId)

    // Same-process fallback when worker and API share a process
    RunExtractPmtilesJob.childProcesses.get(jobId)?.kill('SIGTERM')
    RunExtractPmtilesJob.childProcesses.delete(jobId)

    await this._pollForTerminalState(job, jobId)
    await this._removeJobWithLockFallback(job, queue, RunExtractPmtilesJob.queue, jobId)

    if (outputFilepath) {
      try {
        await deleteFileIfExists(outputFilepath)
      } catch {
        // File may not exist yet (subprocess may not have opened it)
      }
    }

    return { success: true, message: 'Extract cancelled and partial file deleted' }
  }

  /** Cancel a content download (zim, map, pmtiles, etc.) */
  private async _cancelFileDownloadJob(
    jobId: string,
    job: any,
    queue: any
  ): Promise<{ success: boolean; message: string }> {
    const filepath = job.data.filepath

    // Signal the worker process to abort the download via Redis
    await RunDownloadJob.signalCancel(jobId)

    // Also try in-memory abort (works if worker is in same process)
    RunDownloadJob.abortControllers.get(jobId)?.abort('user-cancel')
    RunDownloadJob.abortControllers.delete(jobId)

    await this._pollForTerminalState(job, jobId)
    await this._removeJobWithLockFallback(job, queue, RunDownloadJob.queue, jobId)

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

  /** Cancel an Ollama model download — mirrors the file cancel pattern but skips file cleanup */
  private async _cancelModelDownloadJob(
    jobId: string,
    job: any,
    queue: any
  ): Promise<{ success: boolean; message: string }> {
    const modelName: string = job.data?.modelName ?? 'unknown'

    // Signal the worker process to abort the pull via Redis
    await DownloadModelJob.signalCancel(jobId)

    // Also try in-memory abort (works if worker is in same process)
    DownloadModelJob.abortControllers.get(jobId)?.abort('user-cancel')
    DownloadModelJob.abortControllers.delete(jobId)

    await this._pollForTerminalState(job, jobId)
    await this._removeJobWithLockFallback(job, queue, DownloadModelJob.queue, jobId)

    // Broadcast a cancelled event so the frontend hook clears the entry. We use percent: -2
    // (distinct from -1 = error) so the hook can route it to a 2s auto-clear instead of the
    // 15s error display. The frontend ALSO removes the entry optimistically from the API
    // response, so this is belt-and-suspenders for cases where the SSE arrives first.
    transmit.broadcast(BROADCAST_CHANNELS.OLLAMA_MODEL_DOWNLOAD, {
      model: modelName,
      jobId,
      percent: -2,
      status: 'cancelled',
      timestamp: new Date().toISOString(),
    })

    // Note on partial blob cleanup: Ollama manages model blobs internally at
    // /root/.ollama/models/blobs/. We deliberately do NOT call /api/delete here — Ollama's
    // expected behavior is to retain partial blobs so a re-pull resumes from where it left
    // off. If the user wants to reclaim that space, they can re-pull and let it complete,
    // or delete the partially-downloaded model from the AI Settings page.
    return { success: true, message: 'Model download cancelled' }
  }

  /** Wait up to 4s (250ms intervals) for the job to reach a terminal state */
  private async _pollForTerminalState(job: any, jobId: string): Promise<void> {
    const POLL_INTERVAL_MS = 250
    const POLL_TIMEOUT_MS = 4000
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      try {
        const state = await job.getState()
        if (state === 'failed' || state === 'completed' || state === 'unknown') {
          return
        }
      } catch {
        return // getState() throws if job is already gone
      }
    }

    console.warn(
      `[DownloadService] cancelJob: job ${jobId} did not reach terminal state within timeout, removing anyway`
    )
  }

  /** Remove a BullMQ job, clearing a stale worker lock if the first attempt fails */
  private async _removeJobWithLockFallback(
    job: any,
    queue: any,
    queueName: string,
    jobId: string
  ): Promise<void> {
    try {
      await job.remove()
    } catch {
      // Lock contention fallback: clear lock and retry once
      try {
        const client = await queue.client
        await client.del(`bull:${queueName}:${jobId}:lock`)
        const updatedJob = await queue.getJob(jobId)
        if (updatedJob) await updatedJob.remove()
      } catch {
        // Best effort - job will be cleaned up on next dismiss attempt
      }
    }
  }
}
