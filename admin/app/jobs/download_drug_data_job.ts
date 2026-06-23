import { Job } from 'bullmq'
import { access, mkdir, constants } from 'node:fs/promises'
import logger from '@adonisjs/core/services/logger'
import { QueueService } from '#services/queue_service'
import { doResumableDownload } from '../utils/downloads.js'
import { parseDrugLabelManifest, partZipPath } from '../../util/drug_labels.js'
import type {
  DownloadDrugDataJobParams,
  DrugLabelManifest,
  DownloadStateMarker,
} from '../../types/drug_reference.js'

/** Where all part zips are staged on the bind-mounted storage volume. */
export const STORAGE_BASE = '/app/storage/drug-data'
const MANIFEST_URL = 'https://api.fda.gov/download.json'

/**
 * Phase A — Download (network-only failure domain).
 *
 * Pass 0 fetches the openFDA manifest; each later pass downloads ONE part to
 * disk (resumable via doResumableDownload, so a worker restart resumes from the
 * .tmp rather than re-downloading). Continuations use queue.add with NO jobId —
 * the same rule as the embed/ingest chains, so BullMQ dedupe doesn't swallow the
 * next part against the lingering parent. After the last part lands we write the
 * `drugReference.downloadState` KV marker and, when auto-chaining, dispatch the
 * ingest phase. Parts are NEVER deleted here — they persist until a full ingest
 * succeeds so the manual "Ingest into search" path can re-run from disk.
 */
export class DownloadDrugDataJob {
  static get queue() {
    return 'drug-download'
  }

  static get key() {
    return 'download-drug-data'
  }

  /** Deterministic jobId — only one download at a time, re-runnable. */
  static get jobId() {
    return 'drug-data-download'
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Dispatch the initial download (pass 0). Idempotent on the deterministic
   * jobId. A finished/failed prior job under that id is cleared first so the
   * "Download FDA data" button can always restart (resume is handled at the
   * file level by doResumableDownload).
   *
   * @param autoChain - dispatch the ingest phase after the last part. Default true.
   */
  static async dispatch(autoChain = true) {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    const existing = await queue.getJob(this.jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return { job: existing, created: false, message: 'Drug data download already running' }
      }
      try {
        await existing.remove()
      } catch {
        // Best-effort: fall through to add, which surfaces any genuine conflict.
      }
    }

    try {
      const job = await queue.add(
        this.key,
        { autoChain } satisfies DownloadDrugDataJobParams,
        {
          jobId: this.jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 5 },
        }
      )
      return { job, created: true, message: 'Drug data download dispatched' }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('job already exists')) {
        const stillThere = await queue.getJob(this.jobId)
        return { job: stillThere, created: false, message: 'Drug data download already running' }
      }
      throw error
    }
  }

  static async getJob(): Promise<Job | undefined> {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)
    return await queue.getJob(this.jobId)
  }

  // ─── Job handler ───────────────────────────────────────────────────────────

  async handle(job: Job) {
    const params = job.data as DownloadDrugDataJobParams
    const partIndex = params.partIndex ?? 0
    const autoChain = params.autoChain ?? true
    const startedAt = params.startedAt ?? Date.now()

    logger.info(`[DownloadDrugDataJob] Starting pass partIndex=${partIndex}`)

    // Pre-flight: storage drive writable.
    await this.verifyStorageAvailable(job)

    // Pass 0: fetch the manifest.
    let manifest: DrugLabelManifest
    if (partIndex === 0 || !params.manifest) {
      await job.updateData({
        ...job.data,
        phase: 'manifest',
        partIndex: 0,
        totalParts: 0,
        currentPartName: null,
        autoChain,
        startedAt,
      })
      await job.updateProgress(0)

      logger.info('[DownloadDrugDataJob] Fetching manifest from api.fda.gov/download.json')
      manifest = await this.fetchManifest()
      logger.info(
        `[DownloadDrugDataJob] Manifest: export_date=${manifest.export_date} ` +
          `total_records=${manifest.total_records} parts=${manifest.partitions.length}`
      )
    } else {
      manifest = params.manifest
    }

    const totalParts = params.totalParts ?? manifest.partitions.length

    if (partIndex >= totalParts) {
      logger.warn(
        `[DownloadDrugDataJob] partIndex ${partIndex} >= totalParts ${totalParts}, nothing to do`
      )
      return
    }

    const partition = manifest.partitions[partIndex]
    const zipPath = partZipPath(STORAGE_BASE, partition)
    const partName = partition.display_name || partition.file

    logger.info(
      `[DownloadDrugDataJob] Downloading part ${partIndex + 1}/${totalParts}: ${partName}`
    )

    await job.updateData({
      ...job.data,
      phase: 'downloading',
      partIndex,
      totalParts,
      currentPartName: partName,
      manifest,
      autoChain,
      startedAt,
      bytesDownloaded: 0,
    })
    await job.updateProgress(Math.floor((partIndex / totalParts) * 100))

    await mkdir(STORAGE_BASE, { recursive: true })

    logger.info(`[DownloadDrugDataJob] ${partition.file} → ${zipPath}`)
    let partBytes = 0
    await doResumableDownload({
      url: partition.file,
      filepath: zipPath,
      timeout: 300_000, // 5-minute per-chunk timeout
      allowedMimeTypes: [], // skip MIME check — zip content-type varies across CDNs
      onProgress: (progress) => {
        partBytes = progress.downloadedBytes
        const downloadFraction = progress.downloadedBytes / (progress.totalBytes || 1)
        const pct = Math.floor(((partIndex + downloadFraction) / totalParts) * 100)
        // Fire-and-forget; swallow transient reject so it can't crash the worker.
        void job.updateProgress(pct).catch(() => {})
        void job.updateData({ ...job.data, bytesDownloaded: progress.downloadedBytes }).catch(() => {})
      },
    })
    logger.info(`[DownloadDrugDataJob] Download complete: ${zipPath} (${partBytes} bytes)`)

    // Record this part for the download-state marker (written after the last one).
    const recordedParts =
      (params as { recordedParts?: DownloadStateMarker['parts'] }).recordedParts ?? []
    recordedParts.push({ index: partIndex, name: partName, path: zipPath, bytes: partBytes })

    const nextIndex = partIndex + 1

    if (nextIndex < totalParts) {
      // Continuation — NO jobId (let BullMQ auto-generate). The critical rule.
      const queueService = QueueService.getInstance()
      const queue = queueService.getQueue(DownloadDrugDataJob.queue)

      const continuationParams: DownloadDrugDataJobParams & {
        recordedParts: DownloadStateMarker['parts']
      } = {
        partIndex: nextIndex,
        manifest,
        totalParts,
        autoChain,
        startedAt,
        recordedParts,
      }

      await queue.add(DownloadDrugDataJob.key, continuationParams, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 5 },
      })
      logger.info(
        `[DownloadDrugDataJob] Dispatched continuation for part ${nextIndex + 1}/${totalParts}`
      )
    } else {
      // Last part — write the download-state marker. Parts stay on disk until a
      // full ingest succeeds; do NOT delete them here.
      await this.writeDownloadState(manifest, totalParts, recordedParts)
      await job.updateData({
        ...job.data,
        phase: 'downloaded',
        partIndex,
        totalParts,
        currentPartName: null,
      })
      await job.updateProgress(100)
      logger.info(
        `[DownloadDrugDataJob] All ${totalParts} parts downloaded. ` +
          `export_date=${manifest.export_date}`
      )

      if (autoChain) {
        const { IngestDrugDataJob } = await import('#jobs/ingest_drug_data_job')
        await IngestDrugDataJob.dispatch()
        logger.info('[DownloadDrugDataJob] Auto-chained ingest phase')
      }
    }

    return { partIndex, totalParts }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async verifyStorageAvailable(job: Job): Promise<void> {
    try {
      await access(STORAGE_BASE, constants.W_OK)
    } catch {
      try {
        await mkdir(STORAGE_BASE, { recursive: true })
      } catch (mkdirErr) {
        await job.updateData({ ...job.data, phase: 'failed' })
        throw new Error(
          `Storage drive not available: cannot write to ${STORAGE_BASE} (${
            mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr)
          })`
        )
      }
    }
  }

  private async fetchManifest(): Promise<DrugLabelManifest> {
    let json: unknown
    try {
      const resp = await fetch(MANIFEST_URL)
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${MANIFEST_URL}`)
      }
      json = await resp.json()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (
        msg.includes('ENOTFOUND') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ECONNRESET') ||
        msg.includes('fetch failed')
      ) {
        throw new Error(`No internet — connect to download FDA drug data. (${msg})`)
      }
      throw err
    }
    return parseDrugLabelManifest(json)
  }

  private async writeDownloadState(
    manifest: DrugLabelManifest,
    totalParts: number,
    parts: DownloadStateMarker['parts']
  ): Promise<void> {
    const KVStore = (await import('#models/kv_store')).default
    const marker: DownloadStateMarker = {
      export_date: manifest.export_date,
      totalParts,
      totalRecords: manifest.total_records,
      parts,
      completedAtMs: Date.now(),
    }
    await KVStore.setValue('drugReference.downloadState', JSON.stringify(marker))
  }
}
