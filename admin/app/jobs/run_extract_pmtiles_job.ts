import { Job, UnrecoverableError } from 'bullmq'
import { spawn, ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { readdir, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { QueueService } from '#services/queue_service'
import logger from '@adonisjs/core/services/logger'
import { DownloadProgressData } from '../../types/downloads.js'
import { PMTILES_BINARY_PATH, buildPmtilesExtractArgs } from '../../constants/map_regions.js'
import { deleteFileIfExists } from '../utils/fs.js'

export interface RunExtractPmtilesJobParams {
  sourceUrl: string
  outputFilepath: string
  /** Path to a GeoJSON FeatureCollection file passed to `pmtiles extract --region`. */
  regionFilepath: string
  maxzoom?: number
  /** Hint for progress reporting; obtained from `pmtiles extract --dry-run` preflight */
  estimatedBytes?: number
  filetype: 'map'
  title?: string
  resourceMetadata?: {
    resource_id: string
    version: string
    collection_ref: string | null
  }
}

export class RunExtractPmtilesJob {
  static get queue() {
    return 'pmtiles-extract'
  }

  static get key() {
    return 'run-pmtiles-extract'
  }

  /** In-memory registry of active child processes so in-process cancels can SIGTERM them */
  static childProcesses: Map<string, ChildProcess> = new Map()

  static getJobId(sourceUrl: string, regionFilepath: string, maxzoom?: number): string {
    const payload = JSON.stringify({ sourceUrl, regionFilepath, maxzoom: maxzoom ?? null })
    return createHash('sha256').update(payload).digest('hex').slice(0, 16)
  }

  /** Redis key used to signal cancellation across processes */
  static cancelKey(jobId: string): string {
    return `nomad:download:pmtiles-cancel:${jobId}`
  }

  static async signalCancel(jobId: string): Promise<void> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const client = await queue.client
    await client.set(this.cancelKey(jobId), '1', 'EX', 300)
  }

  /** Awaits job.updateProgress and swallows BullMQ stale-job errors (code -1),
   *  which occur when the job was removed from Redis (e.g. cancelled) between
   *  the await being issued and the Redis write completing. Anything else
   *  re-throws so it's caught by the surrounding try rather than becoming an
   *  unhandled rejection. */
  private async safeUpdateProgress(job: Job, progress: DownloadProgressData): Promise<void> {
    try {
      await job.updateProgress(progress)
    } catch (err: any) {
      if (err?.code !== -1) throw err
    }
  }

  async handle(job: Job) {
    const params = job.data as RunExtractPmtilesJobParams
    const { sourceUrl, outputFilepath, regionFilepath, maxzoom, estimatedBytes } = params

    logger.info(
      `[RunExtractPmtilesJob] Starting extract: source=${sourceUrl} region=${regionFilepath} ` +
        `maxzoom=${maxzoom ?? 'source-max'} out=${outputFilepath}`
    )

    const queueService = new QueueService()
    const cancelRedis = await queueService.getQueue(RunExtractPmtilesJob.queue).client

    let userCancelled = false
    let proc: ChildProcess | null = null
    let lastReportedBytes = -1

    // One 2s tick polls the Redis cancel signal and reads file-size for progress. pmtiles
    // writes incrementally but rewrites directories near the end so progress isn't strictly
    // monotonic — we cap at 99% and skip emit when bytes are unchanged to avoid Redis chatter.
    const tick = setInterval(async () => {
      try {
        const val = await cancelRedis.get(RunExtractPmtilesJob.cancelKey(job.id!))
        if (val) {
          await cancelRedis.del(RunExtractPmtilesJob.cancelKey(job.id!))
          userCancelled = true
          proc?.kill('SIGTERM')
        }
      } catch {
        // Redis errors non-fatal — in-memory handle also covers same-process cancels
      }

      try {
        const fileStat = await stat(outputFilepath)
        const downloadedBytes = Number(fileStat.size)
        if (downloadedBytes === lastReportedBytes) return
        lastReportedBytes = downloadedBytes

        const totalBytes = estimatedBytes ?? 0
        const percent =
          totalBytes > 0 ? Math.min(99, Math.floor((downloadedBytes / totalBytes) * 100)) : 0

        await this.safeUpdateProgress(job, {
          percent,
          downloadedBytes,
          totalBytes,
          lastProgressTime: Date.now(),
        } as DownloadProgressData)
      } catch {
        // File doesn't exist yet (subprocess still setting up)
      }
    }, 2000)

    try {
      const args = buildPmtilesExtractArgs({
        sourceUrl,
        outputFilepath,
        regionFilepath,
        maxzoom,
        downloadThreads: 8,
        overfetch: 0.2,
      })
      proc = spawn(PMTILES_BINARY_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      RunExtractPmtilesJob.childProcesses.set(job.id!, proc)

      proc.stdout?.on('data', (chunk) => {
        logger.debug(`[RunExtractPmtilesJob:${job.id}] ${chunk.toString().trimEnd()}`)
      })
      proc.stderr?.on('data', (chunk) => {
        logger.debug(`[RunExtractPmtilesJob:${job.id}] ${chunk.toString().trimEnd()}`)
      })

      const exitCode: number = await new Promise((resolve, reject) => {
        proc!.on('close', (code) => resolve(code ?? -1))
        proc!.on('error', (err) => reject(err))
      })

      if (exitCode !== 0) {
        await deleteFileIfExists(outputFilepath)
        if (userCancelled) {
          throw new UnrecoverableError(`Extract cancelled by user (exit ${exitCode})`)
        }
        throw new Error(`pmtiles extract exited with code ${exitCode}`)
      }

      // Final progress bump — tick caps at 99 so the UI doesn't flicker to 100 mid-extract
      const finalStat = await stat(outputFilepath)
      await this.safeUpdateProgress(job, {
        percent: 100,
        downloadedBytes: Number(finalStat.size),
        totalBytes: estimatedBytes ?? Number(finalStat.size),
        lastProgressTime: Date.now(),
      } as DownloadProgressData)

      // Reuse the HTTP download path's post-download hook so the file is registered and
      // the previous version (if any) is deleted
      await this.onComplete(params)

      logger.info(
        `[RunExtractPmtilesJob] Completed extract: out=${outputFilepath} size=${finalStat.size} bytes`
      )

      return { sourceUrl, outputFilepath }
    } catch (error: any) {
      if (userCancelled && !(error instanceof UnrecoverableError)) {
        throw new UnrecoverableError(`Extract cancelled: ${error.message ?? error}`)
      }
      throw error
    } finally {
      clearInterval(tick)
      RunExtractPmtilesJob.childProcesses.delete(job.id!)
    }
  }

  private async onComplete(params: RunExtractPmtilesJobParams) {
    if (!params.resourceMetadata) return

    const [{ default: InstalledResource }, { DateTime }, fsUtils] = await Promise.all([
      import('#models/installed_resource'),
      import('luxon'),
      import('../utils/fs.js'),
    ])

    const fileStat = await fsUtils.getFileStatsIfExists(params.outputFilepath)

    const existing = await InstalledResource.query()
      .where('resource_id', params.resourceMetadata.resource_id)
      .where('resource_type', 'map')
      .first()
    const oldFilePath = existing?.file_path ?? null

    await InstalledResource.updateOrCreate(
      {
        resource_id: params.resourceMetadata.resource_id,
        resource_type: 'map',
      },
      {
        version: params.resourceMetadata.version,
        collection_ref: params.resourceMetadata.collection_ref,
        url: params.sourceUrl,
        file_path: params.outputFilepath,
        file_size_bytes: fileStat ? Number(fileStat.size) : null,
        installed_at: DateTime.now(),
      }
    )

    if (oldFilePath && oldFilePath !== params.outputFilepath) {
      try {
        await fsUtils.deleteFileIfExists(oldFilePath)
      } catch (err) {
        logger.warn(`[RunExtractPmtilesJob] Failed to delete old file ${oldFilePath}: ${err}`)
      }
    }

    // Fallback: scan the pmtiles dir for orphans with the same resource_id that the DB
    // lookup above didn't catch — e.g. a prior extract crashed before writing its
    // InstalledResource row, or an earlier bug wrote a file without registering it.
    // Matches both curated (`<id>_YYYY-MM.pmtiles`) and regional (`<id>_YYYYMMDD_zN.pmtiles`)
    // naming — prefix-only so new filename formats don't silently miss.
    const dir = dirname(params.outputFilepath)
    const keepName = basename(params.outputFilepath)
    const prefix = `${params.resourceMetadata.resource_id}_`
    try {
      const entries = await readdir(dir)
      for (const entry of entries) {
        if (entry === keepName || !entry.endsWith('.pmtiles')) continue
        if (!entry.startsWith(prefix)) continue
        const orphanPath = join(dir, entry)
        if (orphanPath === oldFilePath) continue
        try {
          await fsUtils.deleteFileIfExists(orphanPath)
          logger.info(`[RunExtractPmtilesJob] Pruned orphan pmtiles ${orphanPath}`)
        } catch (err) {
          logger.warn(`[RunExtractPmtilesJob] Failed to prune orphan ${orphanPath}: ${err}`)
        }
      }
    } catch (err) {
      logger.warn(`[RunExtractPmtilesJob] Directory scan for orphans failed: ${err}`)
    }
  }

  static async getById(jobId: string): Promise<Job | undefined> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    return await queue.getJob(jobId)
  }

  static async dispatch(params: RunExtractPmtilesJobParams) {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(params.sourceUrl, params.regionFilepath, params.maxzoom)

    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return {
          job: existing,
          created: false,
          message: `Extract job already exists for these params`,
        }
      }
      // Stale (completed/failed) — remove so we can re-dispatch under the same deterministic id
      try {
        await existing.remove()
      } catch {
        // Already gone or locked — add() below will still report a meaningful error
      }
    }

    // Fewer attempts than HTTP downloads — a failed extract usually means the source URL
    // rotated or the CDN is throttling, and resuming mid-extract isn't supported by the CLI
    const job = await queue.add(this.key, params, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: true,
    })
    return {
      job,
      created: true,
      message: `Dispatched pmtiles extract job`,
    }
  }
}
