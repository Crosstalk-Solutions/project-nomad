import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { Job } from 'bullmq'
import { QueueService } from './queue_service.js'
import { DownloadDrugDataJob } from '#jobs/download_drug_data_job'
import { IngestDrugDataJob } from '#jobs/ingest_drug_data_job'
import {
  normalizeDrugName,
  parseDownloadState,
  deriveIngestPhase,
  resolveExpectedTotal,
  resolveIngestRecordsShown,
  summarizeJobError,
} from '../../util/drug_labels.js'
import KVStore from '#models/kv_store'
import { parseCompareIds, MAX_COMPARE } from '../../util/compare_ids.js'
import type {
  DrugSearchResult,
  DrugLabelDetail,
  DrugIngestStatus,
  DrugPhaseState,
  DrugDownloadStatus,
  DrugIngestPhaseStatus,
  DrugInteractionEntry,
} from '../../types/drug_reference.js'

/**
 * Drug Reference v1 — service layer.
 *
 * Exposes search (collapsed by brand+generic), detail fetch, ingest trigger,
 * and ingest status. Mirrors the shape of DownloadService/ZimService.
 */
export class DrugReferenceService {
  /**
   * Search for drug labels, collapsed by (brand_name, generic_name).
   *
   * Each distinct (brand_name, generic_name) pair returns ONE result — a
   * representative row id (MIN(id)) and a labelCount of how many set_ids
   * collapsed into it. This is the locked UX decision.
   *
   * Scope:
   *   'name'       (default) — existing path: MATCH(searchable_name) on brand+generic.
   *   'indication' — new path: MATCH(searchable_name, indications) on the combined
   *                  ft_drug_labels_name_indications index so users can search by
   *                  what a drug treats ("heartburn", "high blood pressure").
   *
   * Strategy (both scopes):
   *   1. FULLTEXT path: MATCH(cols) AGAINST(? IN NATURAL LANGUAGE MODE)
   *      — relevance-ranked, requires >= 3 chars (innodb_ft_min_token_size = 3).
   *   2. LIKE fallback: query < 3 chars OR FULLTEXT throws → LIKE '%term%'.
   *   3. Both paths apply the optional product_type filter and GROUP BY collapse.
   */
  async search(
    query: string,
    options: {
      productType?: string
      route?: string
      sort?: 'relevance' | 'name'
      limit?: number
      offset?: number
      scope?: 'name' | 'indication'
    }
  ): Promise<DrugSearchResult[]> {
    const limit = options.limit ?? 50
    const offset = options.offset ?? 0
    const scope = options.scope ?? 'name'
    const normalized = normalizeDrugName(query, null) ?? query.trim()

    if (!normalized || normalized.length === 0) return []

    const useLike = normalized.length < 3

    if (scope === 'indication') {
      if (!useLike) {
        try {
          return await this.searchIndicationFulltext(normalized, options.productType, limit, offset)
        } catch (err) {
          logger.warn(
            `[DrugReferenceService] FULLTEXT indication search failed, falling back to LIKE: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      }
      return await this.searchIndicationLike(normalized, options.productType, limit, offset)
    }

    if (!useLike) {
      // FULLTEXT path
      try {
        return await this.searchFulltext(normalized, options, limit, offset)
      } catch (err) {
        logger.warn(
          `[DrugReferenceService] FULLTEXT search failed, falling back to LIKE: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
    }

    // LIKE fallback
    return await this.searchLike(normalized, options, limit, offset)
  }

  private async searchFulltext(
    normalized: string,
    opts: { productType?: string; route?: string; sort?: 'relevance' | 'name' },
    limit: number,
    offset: number
  ): Promise<DrugSearchResult[]> {
    let sql = `
      SELECT
        MIN(id) AS id,
        brand_name,
        generic_name,
        MIN(manufacturer) AS manufacturer,
        MIN(route) AS route,
        MIN(product_type) AS product_type,
        COUNT(*) AS labelCount,
        MAX(MATCH(searchable_name) AGAINST(? IN NATURAL LANGUAGE MODE)) AS relevance
      FROM drug_labels
      WHERE MATCH(searchable_name) AGAINST(? IN NATURAL LANGUAGE MODE)
    `
    const bindings: unknown[] = [normalized, normalized]

    if (opts.productType) {
      sql += ' AND product_type = ?'
      bindings.push(opts.productType)
    }
    if (opts.route) {
      // `route` is a comma-joined uppercase list (e.g. "ORAL, TOPICAL").
      sql += ' AND route LIKE ?'
      bindings.push(`%${opts.route.toUpperCase()}%`)
    }

    sql += `
      GROUP BY brand_name, generic_name
      ORDER BY ${opts.sort === 'name' ? 'COALESCE(brand_name, generic_name) ASC' : 'relevance DESC'}
      LIMIT ? OFFSET ?
    `
    bindings.push(limit, offset)

    const rows = await db.rawQuery(sql, bindings)
    return this.mapSearchRows(rows[0])
  }

  private async searchLike(
    normalized: string,
    opts: { productType?: string; route?: string; sort?: 'relevance' | 'name' },
    limit: number,
    offset: number
  ): Promise<DrugSearchResult[]> {
    const term = `%${normalized}%`
    let sql = `
      SELECT
        MIN(id) AS id,
        brand_name,
        generic_name,
        MIN(manufacturer) AS manufacturer,
        MIN(route) AS route,
        MIN(product_type) AS product_type,
        COUNT(*) AS labelCount
      FROM drug_labels
      WHERE (searchable_name LIKE ? OR brand_name LIKE ?)
    `
    const bindings: unknown[] = [term, term]

    if (opts.productType) {
      sql += ' AND product_type = ?'
      bindings.push(opts.productType)
    }
    if (opts.route) {
      sql += ' AND route LIKE ?'
      bindings.push(`%${opts.route.toUpperCase()}%`)
    }

    sql += `
      GROUP BY brand_name, generic_name
      ORDER BY brand_name ASC
      LIMIT ? OFFSET ?
    `
    bindings.push(limit, offset)

    const rows = await db.rawQuery(sql, bindings)
    return this.mapSearchRows(rows[0])
  }

  /**
   * FULLTEXT indication-scope search.
   *
   * MATCHes over (searchable_name, indications) — must exactly match the
   * ft_drug_labels_name_indications index column list. The MAX(MATCH …) pattern
   * is LOAD-BEARING: MySQL 8.0 ONLY_FULL_GROUP_BY rejects a bare MATCH() in
   * SELECT when GROUP BY is in effect; wrapping in MAX() makes it an aggregate
   * and satisfies the mode constraint.
   */
  private async searchIndicationFulltext(
    normalized: string,
    productType: string | undefined,
    limit: number,
    offset: number
  ): Promise<DrugSearchResult[]> {
    let sql = `
      SELECT
        MIN(id) AS id,
        brand_name,
        generic_name,
        MIN(manufacturer) AS manufacturer,
        MIN(route) AS route,
        MIN(product_type) AS product_type,
        COUNT(*) AS labelCount,
        MAX(MATCH(searchable_name, indications) AGAINST(? IN NATURAL LANGUAGE MODE)) AS relevance
      FROM drug_labels
      WHERE MATCH(searchable_name, indications) AGAINST(? IN NATURAL LANGUAGE MODE)
    `
    const bindings: unknown[] = [normalized, normalized]

    if (productType) {
      sql += ' AND product_type = ?'
      bindings.push(productType)
    }

    sql += `
      GROUP BY brand_name, generic_name
      ORDER BY relevance DESC
      LIMIT ? OFFSET ?
    `
    bindings.push(limit, offset)

    const rows = await db.rawQuery(sql, bindings)
    return this.mapSearchRows(rows[0])
  }

  /**
   * LIKE indication-scope fallback (query < 3 chars or FULLTEXT unavailable).
   *
   * Searches searchable_name OR indications so short queries still return
   * useful results without requiring the FULLTEXT index.
   */
  private async searchIndicationLike(
    normalized: string,
    productType: string | undefined,
    limit: number,
    offset: number
  ): Promise<DrugSearchResult[]> {
    const term = `%${normalized}%`
    let sql = `
      SELECT
        MIN(id) AS id,
        brand_name,
        generic_name,
        MIN(manufacturer) AS manufacturer,
        MIN(route) AS route,
        MIN(product_type) AS product_type,
        COUNT(*) AS labelCount
      FROM drug_labels
      WHERE (searchable_name LIKE ? OR indications LIKE ?)
    `
    const bindings: unknown[] = [term, term]

    if (productType) {
      sql += ' AND product_type = ?'
      bindings.push(productType)
    }

    sql += `
      GROUP BY brand_name, generic_name
      ORDER BY brand_name ASC
      LIMIT ? OFFSET ?
    `
    bindings.push(limit, offset)

    const rows = await db.rawQuery(sql, bindings)
    return this.mapSearchRows(rows[0])
  }

  private mapSearchRows(rows: any[]): DrugSearchResult[] {
    if (!Array.isArray(rows)) return []
    return rows.map((row) => ({
      id: Number(row.id),
      brand_name: row.brand_name ?? null,
      generic_name: row.generic_name ?? null,
      manufacturer: row.manufacturer ?? null,
      route: row.route ?? null,
      product_type: row.product_type ?? null,
      labelCount: Number(row.labelCount ?? row.labelcount ?? 1),
    }))
  }

  /**
   * Load the full detail for a single drug label row by its surrogate id.
   * Returns null if the row doesn't exist.
   */
  async find(id: number): Promise<DrugLabelDetail | null> {
    const { default: DrugLabel } = await import('#models/drug_label')
    const row = await DrugLabel.find(id)
    if (!row) return null

    return {
      id: row.id,
      set_id: row.set_id,
      spl_id: row.spl_id,
      version: row.version,
      brand_name: row.brand_name,
      generic_name: row.generic_name,
      manufacturer: row.manufacturer,
      product_ndc: row.product_ndc,
      route: row.route,
      product_type: row.product_type,
      indications: row.indications,
      dosage: row.dosage,
      warnings: row.warnings,
      boxed_warning: row.boxed_warning,
      drug_interactions: row.drug_interactions,
      contraindications: row.contraindications,
      when_using: row.when_using,
      stop_use: row.stop_use,
      source_updated_at: row.source_updated_at,
      ingested_at: row.ingested_at.toISO() ?? '',
    }
  }

  /**
   * Return the drug interaction text for a set of label ids.
   *
   * - Dedupes and caps the id list via parseCompareIds / MAX_COMPARE.
   * - One query: SELECT id, brand_name, generic_name, product_type,
   *   drug_interactions FROM drug_labels WHERE id IN (?).
   * - Re-orders the rows to match the requested id order so the caller's
   *   column positions are stable even if MySQL returns rows in a different
   *   order. Missing ids (non-existent in the table) are silently omitted.
   * - Returns [] for an empty or entirely-invalid id list.
   */
  async getInteractionsFor(ids: number[]): Promise<DrugInteractionEntry[]> {
    if (ids.length === 0) return []

    // Dedupe + cap (caller may already have done this, but be defensive).
    const safeIds = parseCompareIds(ids.join(',')).slice(0, MAX_COMPARE)
    if (safeIds.length === 0) return []

    const placeholders = safeIds.map(() => '?').join(', ')
    const sql = `
      SELECT id, brand_name, generic_name, product_type, drug_interactions
      FROM drug_labels
      WHERE id IN (${placeholders})
    `
    const rows = await db.rawQuery(sql, safeIds)
    const rawRows: Array<{
      id: number | string
      brand_name: string | null
      generic_name: string | null
      product_type: string | null
      drug_interactions: string | null
    }> = Array.isArray(rows[0]) ? rows[0] : []

    // Build a lookup by id so we can re-order to match the request order.
    const byId = new Map<number, DrugInteractionEntry>()
    for (const row of rawRows) {
      const entry: DrugInteractionEntry = {
        id: Number(row.id),
        brand_name: row.brand_name ?? null,
        generic_name: row.generic_name ?? null,
        product_type: row.product_type ?? null,
        drug_interactions: row.drug_interactions ?? null,
      }
      byId.set(entry.id, entry)
    }

    // Re-order: iterate safeIds, include only ids that exist in the table.
    const ordered: DrugInteractionEntry[] = []
    for (const id of safeIds) {
      const entry = byId.get(id)
      if (entry) ordered.push(entry)
    }
    return ordered
  }

  /**
   * Get current row count — what's searchable right now.
   */
  async rowCount(): Promise<number> {
    try {
      const result = await db.rawQuery('SELECT COUNT(*) AS cnt FROM drug_labels')
      const rows = result[0] as Array<{ cnt: number | string }>
      return Number(rows[0]?.cnt ?? 0)
    } catch {
      return 0
    }
  }

  /**
   * Dispatch the download phase (idempotent — deduped by deterministic jobId).
   * Auto-chains the ingest phase on completion. Returns "already running" if the
   * download job is active/waiting.
   */
  async triggerDownload() {
    return DownloadDrugDataJob.dispatch(true)
  }

  /**
   * Dispatch the ingest phase from the already-downloaded on-disk parts (the
   * manual "Ingest into search" path). Guards on the KV download-state marker so
   * it fails fast with a typed result when nothing has been downloaded, rather
   * than dispatching a job that would immediately fail in the worker.
   */
  async triggerIngestFromDisk() {
    const marker = parseDownloadState(await KVStore.getValue('drugReference.downloadState'))
    if (!marker) {
      return {
        job: undefined,
        created: false,
        message: 'Nothing downloaded — run Download FDA data first.',
        nothingDownloaded: true,
      }
    }
    const result = await IngestDrugDataJob.dispatch()
    return { ...result, nothingDownloaded: false }
  }

  /**
   * Force-clear a wedged ingest and restart it from the on-disk parts.
   *
   * A worker killed mid-ingest (e.g. during a `nomad upgrade`) leaves its job
   * 'active' holding a lock BullMQ won't reclaim until lockDuration elapses, so
   * the normal dispatch refuses to start a new ingest and the UI button stays
   * disabled ("Indexing…") with no way out. Obliterating the single-purpose
   * drug-ingest queue removes the stuck job (force = even active/locked); we then
   * re-dispatch from disk. The downloaded parts and the download-state marker are
   * left untouched, so this restarts ingest WITHOUT re-downloading.
   */
  async resetAndReingest() {
    const marker = parseDownloadState(await KVStore.getValue('drugReference.downloadState'))
    if (!marker) {
      return {
        job: undefined,
        created: false,
        message: 'Nothing downloaded — run Download FDA data first.',
        nothingDownloaded: true,
      }
    }

    const queue = QueueService.getInstance().getQueue(IngestDrugDataJob.queue)
    try {
      // force: true removes the active/locked stuck job too. Scoped to the
      // single-purpose ingest queue, so nothing else is affected.
      await queue.obliterate({ force: true })
      logger.info('[DrugReferenceService] drug-ingest queue obliterated for restart')
    } catch (err) {
      logger.warn(
        `[DrugReferenceService] ingest queue obliterate failed (continuing to dispatch): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }

    const result = await IngestDrugDataJob.dispatch()
    return { ...result, nothingDownloaded: false }
  }

  /**
   * Resolve the canonical deterministic job for a phase's queue, falling back to
   * the most-progressed auto-id continuation when the deterministic job is
   * absent or completed (passes > 0 use auto-generated ids). Each phase has its
   * own queue + jobId, so this is called once per queue with the matching ids.
   */
  private async resolvePhaseJob(
    queueName: string,
    deterministicJobId: string
  ): Promise<Job | undefined> {
    const queueService = QueueService.getInstance()
    const queue = queueService.getQueue(queueName)

    let job = await queue.getJob(deterministicJobId)
    if (!job || (await job.getState()) === 'completed') {
      const activeJobs = await queue.getJobs(['active', 'waiting', 'delayed'])
      const continuation = activeJobs
        .filter((j) => j.id !== deterministicJobId)
        .sort((a, b) => (b.data?.partIndex ?? 0) - (a.data?.partIndex ?? 0))[0]
      if (continuation) {
        job = continuation
      } else {
        // No live continuation. If the chain FAILED partway, surface the failed
        // job so the status reads 'failed' instead of falsely 'ready' with only
        // part 1's count. BUT removeOnFail keeps history: a STALE failure from a
        // prior run must not mask a newer successful one (seen live: a fixed
        // re-run completed, yet the panel stayed 'failed' on last night's
        // duplicate-key job). Compare finish times and only surface the failed
        // job when it is the most recent terminal outcome.
        const [failedJobs, completedJobs] = await Promise.all([
          queue.getJobs(['failed']),
          queue.getJobs(['completed']),
        ])
        const newestFailed = failedJobs.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0))[0]
        const newestCompletedFinish = completedJobs.reduce(
          (max, j) => Math.max(max, j.finishedOn ?? 0),
          0
        )
        if (newestFailed && (newestFailed.finishedOn ?? 0) > newestCompletedFinish) {
          job = newestFailed
        }
      }
    }
    return job
  }

  /** Map a BullMQ job state to the per-phase run state. */
  private phaseStateFor(state: string | undefined): DrugPhaseState {
    if (state === 'failed') return 'failed'
    if (state === 'completed') return 'completed'
    if (state === 'active' || state === 'waiting' || state === 'delayed') return 'running'
    return 'idle'
  }

  /**
   * Return the two-phase ingest status for the UI panel. Reads the download job
   * (drug-download queue) and the ingest job (drug-ingest queue) independently,
   * merges the KV download-state marker + last-updated marker + live row count,
   * and derives the top-level phase from the two sub-phases.
   */
  async getIngestStatus(): Promise<DrugIngestStatus> {
    const [downloadJob, ingestJob] = await Promise.all([
      this.resolvePhaseJob(DownloadDrugDataJob.queue, DownloadDrugDataJob.jobId),
      this.resolvePhaseJob(IngestDrugDataJob.queue, IngestDrugDataJob.jobId),
    ])

    const [lastUpdated, rawMarker, count] = await Promise.all([
      KVStore.getValue('drugReference.lastUpdatedExportDate'),
      KVStore.getValue('drugReference.downloadState'),
      this.rowCount(),
    ])
    const marker = parseDownloadState(rawMarker)

    // ── Download sub-status ─────────────────────────────────────────────────
    const dlState = downloadJob ? await downloadJob.getState() : undefined
    const dlData = downloadJob?.data ?? {}
    let downloadPhaseState = this.phaseStateFor(dlState)
    // A finished download job is pruned (removeOnComplete) but the marker proves
    // the parts are on disk — treat that as a completed download phase so the
    // manual "Ingest into search" button stays available.
    if (downloadPhaseState === 'idle' && marker) downloadPhaseState = 'completed'

    const download: DrugDownloadStatus = {
      state: downloadPhaseState,
      partsDone: downloadPhaseState === 'completed' ? (marker?.totalParts ?? dlData.totalParts ?? 0) : (dlData.partIndex ?? 0),
      totalParts: dlData.totalParts ?? marker?.totalParts ?? 0,
      bytesDownloaded: dlData.bytesDownloaded,
      currentPartName: dlData.currentPartName ?? null,
      failedReason:
        dlState === 'failed' ? summarizeJobError(downloadJob?.failedReason) : undefined,
    }

    // ── Ingest sub-status ───────────────────────────────────────────────────
    const ingState = ingestJob ? await ingestJob.getState() : undefined
    const ingData = ingestJob?.data ?? {}
    let ingestPhaseState = this.phaseStateFor(ingState)
    // A pruned-but-successful ingest leaves rows + the last-updated marker and
    // clears the download marker; reflect that as a completed ingest phase.
    if (ingestPhaseState === 'idle' && !marker && count > 0) ingestPhaseState = 'completed'

    // total_records 0 means "unknown" (e.g. a manifest rebuilt from an older
    // marker) — resolveExpectedTotal falls back to a parts estimate, then the
    // live row count, so the counter/%/ETA never silently vanish.
    const expectedTotal = resolveExpectedTotal(
      ingData.manifest?.total_records,
      ingData.totalParts,
      count
    )
    const jobRecords = ingData.recordsIngested ?? 0
    // While ingesting, the per-job recordsIngested lags across the per-part
    // continuation handoff (continuations run under auto jobIds). Drive the shown
    // count from max(jobRecords, live rowCount) so a first ingest tracks the table
    // filling 0 → ~259k, while a re-ingest into a populated table still rides the
    // per-job counter. Outside the running phase, trust the job's own total.
    // Always reconcile against the live row count (the per-job recordsIngested can
    // be a partial/stale total — a completed pass-0 job only counted part 1; a
    // failed continuation stops mid-run). WHILE RUNNING, additionally subtract the
    // run's start-row baseline so a re-ingest into a populated table shows THIS
    // run's progress (0 → ~259k) instead of reading ~100% from second zero.
    // Outside running, start=0 so 'ready'/'failed' reflect total searchable rows.
    const records =
      ingestPhaseState === 'running'
        ? resolveIngestRecordsShown(jobRecords, count, expectedTotal, ingData.startRowCount ?? 0)
        : resolveIngestRecordsShown(jobRecords, count, expectedTotal)

    const ingest: DrugIngestPhaseStatus = {
      state: ingestPhaseState,
      records,
      expectedTotal,
      partsDone: ingData.partIndex ?? 0,
      totalParts: ingData.totalParts ?? marker?.totalParts ?? 0,
      currentPartName: ingData.currentPartName ?? null,
      failedReason: ingState === 'failed' ? summarizeJobError(ingestJob?.failedReason) : undefined,
    }

    const phase = deriveIngestPhase(download, ingest, count)

    // The active phase drives elapsed/ETA: ingest start when ingesting, else the
    // download start.
    const startedAtMs =
      phase === 'ingesting'
        ? (ingData.startedAt ?? null)
        : phase === 'downloading'
          ? (dlData.startedAt ?? null)
          : null

    const error =
      phase === 'failed' ? (ingest.failedReason ?? download.failedReason) : undefined

    return {
      phase,
      download,
      ingest,
      startedAtMs,
      lastUpdated: lastUpdated ?? null,
      rowCount: count,
      error,
    }
  }
}
