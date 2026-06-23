import { Job } from 'bullmq'
import { promises as fsPromises } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import { Writable } from 'node:stream'
import logger from '@adonisjs/core/services/logger'
import { QueueService } from '#services/queue_service'
import { mapDrugLabelRecord, parseDownloadState, partZipPath } from '../../util/drug_labels.js'
import { STORAGE_BASE } from '#jobs/download_drug_data_job'
import type {
  IngestDrugDataJobParams,
  DrugLabelManifest,
  DrugLabelPartition,
} from '../../types/drug_reference.js'

const BATCH_SIZE = 500

/**
 * Dedupe a batch by set_id, CASE-INSENSITIVELY (last occurrence wins). MySQL's
 * uniq_drug_labels_set_id index uses a case-insensitive collation, so two ids
 * differing only in case are ONE row to the database — the dedupe key must agree
 * with the database's notion of equality or a batch can still collide with
 * itself.
 */
function dedupeBySetId(
  rows: ReturnType<typeof mapDrugLabelRecord>[]
): NonNullable<ReturnType<typeof mapDrugLabelRecord>>[] {
  const bySetId = new Map<string, NonNullable<ReturnType<typeof mapDrugLabelRecord>>>()
  for (const r of rows) {
    if (r) bySetId.set(r.set_id.toLowerCase(), r)
  }
  return [...bySetId.values()]
}

/**
 * Upsert one batch with MySQL-native `INSERT … ON DUPLICATE KEY UPDATE`
 * (knex onConflict().merge()) instead of Lucid's updateOrCreateMany.
 *
 * WHY: updateOrCreateMany SELECTs existing rows and matches them to incoming
 * rows IN JAVASCRIPT — a case-sensitive string compare. The DB's unique key on
 * set_id is case-INsensitive, so when openFDA ships the same set_id with
 * different casing across parts (seen live: part 5's '93A0696B-…' colliding
 * with an earlier part's variant), Lucid misses the match, INSERTs, and the
 * unique key rejects it — aborting the run. A native upsert makes the unique
 * key itself the arbiter: same-key rows update, new rows insert, intra-batch
 * duplicates take the update path. No JS equality anywhere.
 *
 * `ingested_at` is stamped explicitly (raw knex bypasses Lucid's autoCreate);
 * merge() refreshes every inserted column on conflict, preserving the previous
 * "re-ingest updates the row + timestamp" behavior.
 */
async function upsertDrugLabelBatch(
  rows: NonNullable<ReturnType<typeof mapDrugLabelRecord>>[]
): Promise<number> {
  if (rows.length === 0) return 0
  const { default: db } = await import('@adonisjs/lucid/services/db')
  const now = new Date()
  const withTs = rows.map((r) => ({ ...r, ingested_at: now }))
  await db.knexQuery().table('drug_labels').insert(withTs).onConflict('set_id').merge()
  return rows.length
}

// A single 500-row updateOrCreateMany should finish in seconds even on the
// FULLTEXT-indexed drug_labels table. If one batch exceeds this, the DB is
// locked/overloaded — reject loudly so the ingest FAILS VISIBLY (and retries via
// BullMQ) instead of hanging forever with the worker's lock still renewing,
// which reads in the UI as a frozen "part 1 of 13, 0 rows". 0.2.714 removed the
// un-awaited-update worker crash; this removes the remaining silent hang.
const UPSERT_TIMEOUT_MS = 120_000

// No record parsed within this window (the zip-open + JSON-parse stage, BEFORE the
// first batch) means the part is almost certainly corrupt/truncated: yauzl's
// inflate stream hangs with no 'end' and no 'error', so the ingest sat on
// "part 1, 0 rows" forever with the worker's lock still renewing. Fail loud
// instead. Once records flow, the per-batch upsert timeout governs.
const STALL_MS = 90_000

/**
 * updateOrCreateMany with a hard timeout. mysql2 has no default query timeout, so
 * a stuck DB call (metadata lock, exhausted connection pool, FULLTEXT stall)
 * would otherwise never settle and the part-stream would back-pressure to a halt.
 * Promise.race turns that into a rejection the caller can log + fail + retry.
 */
async function withUpsertTimeout<T>(
  work: Promise<T>,
  rowCount: number,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `updateOrCreateMany timed out after ${timeoutMs}ms (batch of ${rowCount} rows) — ` +
              'the database may be locked or overloaded'
          )
        ),
      timeoutMs
    )
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ─── Local type aliases for yauzl callbacks ───────────────────────────────────
// yauzl/stream-json are loaded via dynamic import() with @ts-ignore (see
// streamIngestPart). The real @types ship in devDependencies and resolve on the
// target machine; loading them lazily keeps the pure util/ helpers importable in
// tests without the streaming deps. These local interfaces give the callback
// parameters explicit types without importing yauzl's own types (which aren't
// resolvable in the inertia tsconfig context).
import type { Readable } from 'node:stream'

interface YauzlEntry { fileName: string }
interface YauzlZipFile {
  readEntry(): void
  openReadStream(entry: YauzlEntry, cb: (err: Error | null, stream: Readable | null) => void): void
  on(event: 'entry', listener: (entry: YauzlEntry) => void): this
  on(event: 'end', listener: () => void): this
  on(event: 'error', listener: (err: Error) => void): this
}

/**
 * Phase B — Ingest (parse/DB-only failure domain, ZERO network I/O).
 *
 * Each pass reads ONE on-disk part and streams it into drug_labels via the
 * memory-safe streamIngestPart pipeline (yauzl → stream-json → batched
 * updateOrCreateMany). The part list comes from the manifest in job data OR, for
 * a manual "Ingest into search" run with no manifest, is rebuilt from the
 * `drugReference.downloadState` KV marker. A missing on-disk part fails loudly
 * ("run Download first") rather than silently under-ingesting. Continuations use
 * queue.add with NO jobId. After the LAST part: write the final KV status, then
 * delete the downloaded parts and clear the download-state marker (the per-part
 * unlink that used to run during download moves here — parts persist until a
 * full ingest succeeds).
 */
export class IngestDrugDataJob {
  static get queue() {
    return 'drug-ingest'
  }

  static get key() {
    return 'ingest-drug-data'
  }

  /** Deterministic jobId — only one ingest at a time, re-runnable. */
  static get jobId() {
    return 'drug-labels-ingest'
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Dispatch the initial ingest (pass 0). Idempotent on the deterministic jobId.
   * A finished/failed prior job under that id is cleared first so a re-ingest can
   * always restart (upserts are idempotent on set_id).
   */
  static async dispatch() {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(this.queue)

    const existing = await queue.getJob(this.jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return { job: existing, created: false, message: 'Drug label ingest already running' }
      }
      try {
        await existing.remove()
      } catch {
        // Best-effort: fall through to add.
      }
    }

    try {
      const job = await queue.add(
        this.key,
        {} satisfies IngestDrugDataJobParams,
        {
          jobId: this.jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 5 },
        }
      )
      return { job, created: true, message: 'Drug label ingest dispatched' }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('job already exists')) {
        const stillThere = await queue.getJob(this.jobId)
        return { job: stillThere, created: false, message: 'Drug label ingest already running' }
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
    const params = job.data as IngestDrugDataJobParams
    const partIndex = params.partIndex ?? 0
    const runningIngested = params.recordsIngested ?? 0
    const runningSkipped = params.recordsSkipped ?? 0
    const startedAt = params.startedAt ?? Date.now()

    // Progress baseline (pass 0 only): the table's row count BEFORE this run.
    // Without it, a re-ingest into a populated table shows ~100% from second
    // zero because the live row count dominates the shown counter.
    let startRowCount = params.startRowCount
    if (startRowCount === undefined) {
      try {
        const { default: db } = await import('@adonisjs/lucid/services/db')
        const result = await db.rawQuery('SELECT COUNT(*) AS cnt FROM drug_labels')
        const rows = result[0] as Array<{ cnt: number | string }>
        startRowCount = Number(rows[0]?.cnt ?? 0)
      } catch {
        startRowCount = 0
      }
    }

    logger.info(`[IngestDrugDataJob] Starting pass partIndex=${partIndex}`)

    // Resolve the part list: manifest in job data, else the KV download marker.
    const { manifest, exportDate } = await this.resolvePartSource(params)
    const totalParts = params.totalParts ?? manifest.partitions.length

    if (partIndex >= totalParts) {
      logger.warn(
        `[IngestDrugDataJob] partIndex ${partIndex} >= totalParts ${totalParts}, nothing to do`
      )
      return
    }

    const partition = manifest.partitions[partIndex]
    const zipPath = partZipPath(STORAGE_BASE, partition)
    const partName = partition.display_name || partition.file

    // Guard: the part MUST already be on disk. No re-download here — fail loud so
    // a missing part can't silently produce a "ready" status with fewer rows.
    try {
      await access(zipPath, constants.R_OK)
    } catch {
      await job.updateData({ ...job.data, phase: 'failed' })
      throw new Error(
        `Part ${partIndex + 1}/${totalParts} not downloaded (${zipPath}). ` +
          'Run Download FDA data first.'
      )
    }

    logger.info(
      `[IngestDrugDataJob] Ingesting part ${partIndex + 1}/${totalParts}: ${partName}`
    )

    await job.updateData({
      ...job.data,
      phase: 'ingesting',
      partIndex,
      totalParts,
      currentPartName: partName,
      recordsIngested: runningIngested,
      recordsSkipped: runningSkipped,
      manifest,
      startedAt,
      startRowCount,
    })
    await job.updateProgress(Math.floor((partIndex / totalParts) * 100))

    const { recordsIngested: partIngested, recordsSkipped: partSkipped } =
      await this.streamIngestPart(
        job,
        zipPath,
        partIndex,
        totalParts,
        runningIngested,
        runningSkipped
      )

    const totalIngested = runningIngested + partIngested
    const totalSkipped = runningSkipped + partSkipped

    logger.info(
      `[IngestDrugDataJob] Part ${partIndex + 1} done: ` +
        `ingested=${partIngested} skipped=${partSkipped} running_total=${totalIngested}`
    )

    const nextIndex = partIndex + 1

    if (nextIndex < totalParts) {
      // Continuation — NO jobId. The critical rule.
      const queueService = QueueService.getInstance()
      const queue = queueService.getQueue(IngestDrugDataJob.queue)

      const continuationParams: IngestDrugDataJobParams = {
        partIndex: nextIndex,
        manifest,
        totalParts,
        recordsIngested: totalIngested,
        recordsSkipped: totalSkipped,
        startedAt,
        startRowCount,
      }

      await queue.add(IngestDrugDataJob.key, continuationParams, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 5 },
      })
      logger.info(`[IngestDrugDataJob] Dispatched continuation for part ${nextIndex + 1}/${totalParts}`)

      await job.updateData({
        ...job.data,
        phase: 'ingesting',
        partIndex,
        totalParts,
        recordsIngested: totalIngested,
        recordsSkipped: totalSkipped,
      })
    } else {
      // Final part — write KV status, mark ready, THEN reclaim disk.
      await this.writeFinalStatus(exportDate)

      await job.updateData({
        ...job.data,
        phase: 'ready',
        partIndex,
        totalParts,
        currentPartName: null,
        recordsIngested: totalIngested,
        recordsSkipped: totalSkipped,
      })
      await job.updateProgress(100)

      logger.info(
        `[IngestDrugDataJob] Ingest complete. ` +
          `total_ingested=${totalIngested} total_skipped=${totalSkipped} ` +
          `export_date=${exportDate}`
      )

      // Reclaim disk only after a FULL ingest succeeds.
      await this.deleteDownloadedParts(manifest, totalParts)
    }

    return { partIndex, totalIngested, totalSkipped }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the ordered partition list + export_date for this ingest run.
   *
   * Prefers the manifest carried in job data (auto-chained from the download job,
   * or a continuation pass). Falls back to the KV download-state marker so a
   * manual "Ingest into search" with no manifest still works — the marker stores
   * each part's on-disk path and manifest index, which is enough to drive
   * streamIngestPart without re-fetching the manifest from the network. Fails
   * loudly if neither source is present.
   */
  private async resolvePartSource(
    params: IngestDrugDataJobParams
  ): Promise<{ manifest: DrugLabelManifest; exportDate: string }> {
    if (params.manifest) {
      return { manifest: params.manifest, exportDate: params.manifest.export_date }
    }

    const KVStore = (await import('#models/kv_store')).default
    const marker = parseDownloadState(await KVStore.getValue('drugReference.downloadState'))
    if (!marker) {
      throw new Error('Nothing downloaded — run Download FDA data first.')
    }

    // Rebuild a manifest-shaped partition list from the marker. partZipPath uses
    // path.basename(partition.file), so feeding the recorded path as `file`
    // resolves back to the same on-disk path.
    const ordered = [...marker.parts].sort((a, b) => a.index - b.index)
    const partitions: DrugLabelPartition[] = ordered.map((p) => ({
      display_name: p.name,
      file: p.path,
      size_mb: '0',
      records: 0,
    }))

    const manifest: DrugLabelManifest = {
      export_date: marker.export_date,
      // The marker persists the real manifest total (~259k) so a rebuilt
      // manifest carries the same label-count denominator the auto-chained run
      // would have had — keeping the "X of ~259k" counter, the records-based
      // progress %, and the ETA alive on the manual-ingest path. Pre-totalRecords
      // markers parse back as 0; the service treats 0 as unknown and falls back.
      total_records: marker.totalRecords,
      partitions,
    }
    return { manifest, exportDate: marker.export_date }
  }

  /**
   * Stream-unzip the part, stream-parse the JSON, batch-upsert into drug_labels.
   *
   * Memory-safe: never loads the full JSON into memory.
   * Pipeline: yauzl entry read-stream → stream-json Pick+StreamArray → Writable batching.
   * Back-pressure: the Writable's `write()` method calls `callback()` only after
   * the DB upsert resolves, so Node's stream machinery naturally pauses the upstream
   * pipe chain when BATCH_SIZE is reached and an upsert is in flight.
   */
  private async streamIngestPart(
    job: Job,
    zipPath: string,
    partIndex: number,
    totalParts: number,
    runningIngested: number,
    runningSkipped: number
  ): Promise<{ recordsIngested: number; recordsSkipped: number }> {
    // Dynamic imports for the streaming deps (yauzl, stream-json). @ts-ignore
    // covers local dev where node_modules hasn't been refreshed with the new
    // deps yet; it is a no-op once the real @types are installed on the target
    // machine, and it also covers stream-json's deep `.js` subpaths that the
    // @types package doesn't map. Importing here (not at module top) keeps the
    // pure util/ helpers loadable in tests without these deps.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — yauzl resolved at runtime from dependencies
    const yauzl = await import('yauzl')
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — stream-json resolved at runtime from dependencies
    const createParser = (await import('stream-json')).default.parser
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — stream-json deep subpath resolved at runtime
    const createPick = (await import('stream-json/filters/Pick.js')).default.pick
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — stream-json deep subpath resolved at runtime
    const createStreamArray = (await import('stream-json/streamers/StreamArray.js')).default.streamArray

    // Defensive: stream-json 1.9.1 (CJS) exposes its factories only as
    // `.default.parser` / `.default.pick` / `.default.streamArray` under ESM
    // dynamic import — there is NO `parser`/`pick`/`streamArray` named export, so
    // destructuring those silently yielded `undefined`. Calling an undefined
    // "factory" then threw inside the yauzl openReadStream callback (not a
    // promise), the process-level backstop swallowed the uncaughtException, the
    // streamIngestPart promise never settled, and the 90s watchdog fired in a
    // retry loop with zero records. THIS was the real ingest hang. Validate the
    // imports here so any future interop slip fails loud in the async body.
    if (
      typeof createParser !== 'function' ||
      typeof createPick !== 'function' ||
      typeof createStreamArray !== 'function'
    ) {
      throw new Error(
        'stream-json factory imports did not resolve to functions ' +
          `(parser=${typeof createParser}, pick=${typeof createPick}, streamArray=${typeof createStreamArray})`
      )
    }

    let recordsIngested = 0
    let recordsSkipped = 0
    let batch: ReturnType<typeof mapDrugLabelRecord>[] = []
    let batchNum = 0
    let firstRecordSeen = false

    // Cast to `any` so callback parameters get explicit annotations below rather
    // than triggering implicit-any in tsconfigs that don't find the yauzl types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yauzlOpen = (yauzl as any).open as (
      path: string,
      opts: { lazyEntries: boolean; autoClose: boolean },
      cb: (err: Error | null, zipFile: YauzlZipFile | null) => void
    ) => void

    return new Promise<{ recordsIngested: number; recordsSkipped: number }>((resolveRaw, rejectRaw) => {
      // Stall watchdog. The per-batch upsert has a timeout, but the stage BEFORE
      // the first record (zip-open + JSON parse) had none — a corrupt/truncated
      // part makes yauzl's inflate stream hang with no 'end' and no 'error', so
      // the ingest froze on "part 1, 0 rows". If no record is parsed within
      // STALL_MS, fail the part loudly (the reason lands in the job's failedReason
      // → the status panel) and destroy the stuck stream. resolve/reject are
      // wrapped (shadowing the raw executor params) so every existing handler
      // routes through the once-guard + watchdog cleanup.
      let settled = false
      let activeReadStream: Readable | null = null
      let watchdog: ReturnType<typeof setInterval> | undefined
      const watchStart = Date.now()
      const settle = () => {
        settled = true
        if (watchdog) clearInterval(watchdog)
        try {
          activeReadStream?.destroy()
        } catch {
          // best-effort stream teardown
        }
      }
      const resolve = (v: { recordsIngested: number; recordsSkipped: number }) => {
        if (settled) return
        settle()
        resolveRaw(v)
      }
      const reject = (e: Error) => {
        if (settled) return
        settle()
        rejectRaw(e)
      }
      watchdog = setInterval(() => {
        if (!settled && !firstRecordSeen && Date.now() - watchStart > STALL_MS) {
          reject(
            new Error(
              `Ingest stalled: no records parsed from part ${partIndex + 1}/${totalParts} ` +
                `within ${Math.round(STALL_MS / 1000)}s. The downloaded part is likely corrupt ` +
                'or truncated — re-download FDA data, then ingest again.'
            )
          )
        }
      }, 10_000)

      yauzlOpen(zipPath, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
        if (err || !zipFile) {
          reject(err ?? new Error(`Failed to open zip: ${zipPath}`))
          return
        }

        zipFile.on('error', reject)
        zipFile.readEntry()

        zipFile.on('entry', (entry) => {
          // Skip directory entries
          if (/\/$/.test(entry.fileName)) {
            zipFile.readEntry()
            return
          }

          // Open the single JSON entry as a read stream — never buffer it
          zipFile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr || !readStream) {
              reject(streamErr ?? new Error(`Could not open zip entry ${entry.fileName}`))
              return
            }

            logger.info(
              `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: reading zip entry ${entry.fileName}`
            )
            activeReadStream = readStream

            // The JSON envelope is { meta, results: [...] }
            // Pick the `results` path → StreamArray emits one record at a time
            const jsonParser = createParser({ jsonStreaming: false })
            const pick = createPick({ filter: 'results' })
            const streamArray = createStreamArray()

            // Writable that accumulates batches and flushes with back-pressure.
            // The callback is called only after the async upsert completes, which
            // naturally applies back-pressure via the pipe chain.
            const batchWriter = new Writable({
              objectMode: true,
              write(chunk: { value: unknown }, _encoding: BufferEncoding, callback: (err?: Error | null) => void) {
                const record = chunk.value
                if (!firstRecordSeen) {
                  firstRecordSeen = true
                  logger.info(
                    `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: first record received from parser`
                  )
                }

                // Map the record
                let row: ReturnType<typeof mapDrugLabelRecord>
                try {
                  row = mapDrugLabelRecord(record as Parameters<typeof mapDrugLabelRecord>[0])
                } catch (mapErr) {
                  logger.warn(
                    `[IngestDrugDataJob] mapDrugLabelRecord threw: ${mapErr instanceof Error ? mapErr.message : String(mapErr)}`
                  )
                  recordsSkipped++
                  callback()
                  return
                }

                if (!row) {
                  recordsSkipped++
                  callback()
                  return
                }

                batch.push(row)

                if (batch.length < BATCH_SIZE) {
                  // Not full yet — don't block the stream
                  callback()
                  return
                }

                // Batch full — flush and hold the callback until the upsert
                // resolves (this is the back-pressure point).
                const currentBatch = dedupeBySetId(batch)
                batch = []
                const myBatch = ++batchNum
                const t0 = Date.now()
                logger.info(
                  `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: upserting batch ${myBatch} (${currentBatch.length} rows)…`
                )

                withUpsertTimeout(
                  upsertDrugLabelBatch(currentBatch),
                  currentBatch.length,
                  UPSERT_TIMEOUT_MS
                )
                  .then((rowCount) => {
                    recordsIngested += rowCount
                    logger.info(
                      `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: batch ${myBatch} ok in ${Date.now() - t0}ms ` +
                        `(${rowCount} rows; part running ${recordsIngested})`
                    )

                    // Update progress: parts-done fraction + within-part fraction
                    const withinFraction = recordsIngested / Math.max(1, 20000)
                    const pct = Math.floor(
                      ((partIndex + withinFraction) / totalParts) * 100
                    )
                    // Fire-and-forget progress writes. Swallow transient Redis/
                    // job-update rejections: an un-awaited reject would otherwise
                    // bubble to an unhandledRejection and crash the worker, which
                    // BullMQ then reports as "job stalled more than allowable
                    // limit" (a dead worker stops renewing its lock).
                    void job
                      .updateProgress(
                        Math.min(pct, Math.floor(((partIndex + 1) / totalParts) * 100) - 1)
                      )
                      .catch(() => {})
                    void job
                      .updateData({
                        ...job.data,
                        recordsIngested: runningIngested + recordsIngested,
                        recordsSkipped: runningSkipped + recordsSkipped,
                      })
                      .catch(() => {})
                    callback()
                  })
                  .catch((upsertErr: unknown) => {
                    const msg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr)
                    if (/timed out/i.test(msg)) {
                      // Systemic DB hang — fail the part loudly so BullMQ retries.
                      logger.error(
                        `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: batch ${myBatch} TIMED OUT after ${Date.now() - t0}ms: ${msg}`
                      )
                      callback(upsertErr instanceof Error ? upsertErr : new Error(msg))
                      return
                    }
                    // Per-batch data error (a row the schema rejects, etc.) — log,
                    // count as skipped, and CONTINUE. One bad batch must not abort
                    // the whole ~259k ingest (over-correcting to fail-loud here is
                    // what let a single duplicate set_id kill the run at part 5).
                    logger.error(
                      `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: batch ${myBatch} skipped after error (${Date.now() - t0}ms): ${msg}`
                    )
                    recordsSkipped += currentBatch.length
                    callback()
                  })
              },
              final(callback: (err?: Error | null) => void) {
                // Flush the last partial batch
                if (batch.length === 0) {
                  callback()
                  return
                }

                const remainingBatch = dedupeBySetId(batch)
                batch = []
                const t0 = Date.now()
                logger.info(
                  `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: upserting final batch (${remainingBatch.length} rows)…`
                )

                withUpsertTimeout(
                  upsertDrugLabelBatch(remainingBatch),
                  remainingBatch.length,
                  UPSERT_TIMEOUT_MS
                )
                  .then((rowCount) => {
                    recordsIngested += rowCount
                    logger.info(
                      `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: final batch ok in ${Date.now() - t0}ms (${rowCount} rows)`
                    )
                    callback()
                  })
                  .catch((upsertErr: unknown) => {
                    const msg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr)
                    if (/timed out/i.test(msg)) {
                      logger.error(
                        `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: final batch TIMED OUT after ${Date.now() - t0}ms: ${msg}`
                      )
                      callback(upsertErr instanceof Error ? upsertErr : new Error(msg))
                      return
                    }
                    logger.error(
                      `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: final batch skipped after error (${Date.now() - t0}ms): ${msg}`
                    )
                    recordsSkipped += remainingBatch.length
                    callback()
                  })
              },
            })

            batchWriter.on('finish', () => {
              logger.info(
                `[IngestDrugDataJob] part ${partIndex + 1}/${totalParts}: stream finished — ` +
                  `ingested=${recordsIngested} skipped=${recordsSkipped} batches=${batchNum}`
              )
              resolve({ recordsIngested, recordsSkipped })
            })

            batchWriter.on('error', reject)
            readStream.on('error', reject)
            jsonParser.on('error', reject)
            pick.on('error', reject)
            streamArray.on('error', reject)

            // Pipeline: readStream → jsonParser → pick → streamArray → batchWriter
            readStream.pipe(jsonParser).pipe(pick).pipe(streamArray).pipe(batchWriter)
          })
        })

        zipFile.on('end', () => {
          // All zip entries enumerated. The batchWriter 'finish' event resolves
          // the promise once the last batch flushes.
        })
      })
    })
  }

  private async writeFinalStatus(exportDate: string): Promise<void> {
    // Lazy import to keep module top level free of Lucid
    const KVStore = (await import('#models/kv_store')).default
    await KVStore.setValue('drugReference.lastUpdatedExportDate', exportDate)
  }

  /**
   * Delete the downloaded part zips and clear the download-state marker, run once
   * after a full ingest succeeds (reclaims ~1.7 GB). A failed unlink is logged
   * but never aborts a completed ingest.
   */
  private async deleteDownloadedParts(
    manifest: DrugLabelManifest,
    totalParts: number
  ): Promise<void> {
    for (let i = 0; i < totalParts; i++) {
      const partition = manifest.partitions[i]
      if (!partition) continue
      const zipPath = partZipPath(STORAGE_BASE, partition)
      try {
        await fsPromises.unlink(zipPath)
        logger.info(`[IngestDrugDataJob] Deleted zip: ${zipPath}`)
      } catch (err) {
        logger.warn(
          `[IngestDrugDataJob] Could not delete zip ${zipPath}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    const KVStore = (await import('#models/kv_store')).default
    await KVStore.clearValue('drugReference.downloadState')
  }
}
