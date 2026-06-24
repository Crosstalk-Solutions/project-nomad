/**
 * Drug Reference v1 — pure, unit-testable helpers.
 *
 * NO Lucid / AdonisJS / HTTP imports. These take plain objects and return plain
 * objects so they run under @japa/runner without booting MySQL or Redis.
 * Mirrors the `embed_jobs.ts` pattern.
 */

import path from 'node:path'
import type {
  DrugLabelManifest,
  DrugLabelPartition,
  DownloadStateMarker,
  DrugDownloadStatus,
  DrugIngestPhaseStatus,
  DrugIngestPhase,
} from '../types/drug_reference.js'

// ─── Internal structural types (no Lucid) ────────────────────────────────────

/**
 * Structural shape of an openFDA label record — only the fields we care about.
 * Declared locally (no Lucid imports) so the mapper stays pure.
 */
export interface OpenFdaLabelRecord {
  set_id?: string
  id?: string
  version?: string
  effective_time?: string
  openfda?: {
    brand_name?: string[]
    generic_name?: string[]
    manufacturer_name?: string[]
    product_ndc?: string[]
    route?: string[]
    product_type?: string[]
  }
  indications_and_usage?: string[]
  dosage_and_administration?: string[]
  warnings?: string[]
  boxed_warning?: string[]
  drug_interactions?: string[]
  contraindications?: string[]
  when_using?: string[]
  stop_use?: string[]
}

/** Plain row object that matches the DrugLabel Lucid model's column shape. */
export interface DrugLabelRow {
  set_id: string
  spl_id: string | null
  version: string | null
  brand_name: string | null
  generic_name: string | null
  manufacturer: string | null
  product_ndc: string | null
  route: string | null
  product_type: string | null
  searchable_name: string | null
  indications: string | null
  dosage: string | null
  warnings: string | null
  boxed_warning: string | null
  drug_interactions: string | null
  contraindications: string | null
  when_using: string | null
  stop_use: string | null
  source_updated_at: string | null // ISO date YYYY-MM-DD or null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Flatten a section array: join with "\n\n", trim. An absent key or an empty
 * array both return null (no empty strings).
 */
function flattenSection(arr: string[] | undefined): string | null {
  if (!arr || arr.length === 0) return null
  const joined = arr.join('\n\n').trim()
  return joined.length > 0 ? joined : null
}

/**
 * Return the first element of an array, or null if absent/empty.
 */
function firstOf(arr: string[] | undefined): string | null {
  if (!arr || arr.length === 0) return null
  return arr[0] ?? null
}

/**
 * Join an array with ", ", or null if absent/empty.
 */
function joinOf(arr: string[] | undefined): string | null {
  if (!arr || arr.length === 0) return null
  const joined = arr.join(', ').trim()
  return joined.length > 0 ? joined : null
}

/**
 * Parse openFDA effective_time (YYYYMMDD) to ISO date YYYY-MM-DD.
 * Returns null for missing, non-string, or invalid formats.
 */
function parseEffectiveTime(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  // Must be exactly 8 digits
  if (!/^\d{8}$/.test(raw)) return null
  const year = raw.slice(0, 4)
  const month = raw.slice(4, 6)
  const day = raw.slice(6, 8)
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const d = parseInt(day, 10)
  // Basic sanity check: year in a plausible FDA range, month 1–12, day 1–31
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${year}-${month}-${day}`
}

/**
 * Truncate a string to a maximum length (the drug_labels varchar column widths).
 * openFDA joins multi-value fields — e.g. every active ingredient into
 * generic_name — which can exceed a column's width; clamping here keeps the row
 * insertable so one over-long value never fails (and drops) its whole 500-row
 * upsert batch. Section bodies are mediumtext and are never clamped.
 */
function clamp(value: string | null, max: number): string | null {
  if (value === null) return null
  return value.length > max ? value.slice(0, max) : value
}

/** drug_labels varchar column widths — must match the migration. */
const COL = {
  SET_ID: 64,
  SPL_ID: 64,
  VERSION: 16,
  BRAND: 255,
  GENERIC: 512,
  MANUFACTURER: 512,
  PRODUCT_NDC: 255,
  ROUTE: 255,
  PRODUCT_TYPE: 32,
  SEARCHABLE: 768,
} as const

// ─── Exported helpers ─────────────────────────────────────────────────────────

/**
 * Map a raw openFDA label record to a flat DrugLabelRow for upsert.
 *
 * Returns null when the record lacks a usable `set_id` (the idempotency key) —
 * the ingest pipeline skips those and increments `recordsSkipped`.
 *
 * Varchar-bound fields are length-clamped to their column widths so an over-long
 * value can't fail the batch upsert. All section fields are optional (they are
 * absent keys in many records, not empty arrays — verified on live OTC records).
 */
export function mapDrugLabelRecord(record: OpenFdaLabelRecord): DrugLabelRow | null {
  if (!record.set_id || record.set_id.trim() === '') return null
  const setId = record.set_id.trim()
  // set_id is the UNIQUE idempotency key — never truncate it (a truncated key
  // could collide with a different label). openFDA set_ids are 36-char GUIDs, so
  // this guard is defensive, not an expected path.
  if (setId.length > COL.SET_ID) return null

  const brand = firstOf(record.openfda?.brand_name)
  const generic = joinOf(record.openfda?.generic_name)

  return {
    set_id: setId,
    spl_id: clamp(record.id ?? null, COL.SPL_ID),
    version: clamp(record.version ?? null, COL.VERSION),
    brand_name: clamp(brand, COL.BRAND),
    generic_name: clamp(generic, COL.GENERIC),
    manufacturer: clamp(firstOf(record.openfda?.manufacturer_name), COL.MANUFACTURER),
    product_ndc: clamp(joinOf(record.openfda?.product_ndc), COL.PRODUCT_NDC),
    route: clamp(joinOf(record.openfda?.route), COL.ROUTE),
    product_type: clamp(firstOf(record.openfda?.product_type), COL.PRODUCT_TYPE),
    searchable_name: clamp(normalizeDrugName(brand, generic), COL.SEARCHABLE),
    indications: flattenSection(record.indications_and_usage),
    dosage: flattenSection(record.dosage_and_administration),
    warnings: flattenSection(record.warnings),
    boxed_warning: flattenSection(record.boxed_warning),
    drug_interactions: flattenSection(record.drug_interactions),
    contraindications: flattenSection(record.contraindications),
    when_using: flattenSection(record.when_using),
    stop_use: flattenSection(record.stop_use),
    source_updated_at: parseEffectiveTime(record.effective_time),
  }
}

/**
 * Normalize brand + generic names into a searchable blob.
 *
 * Combines the two strings, lowercases, strips non-alphanumeric characters
 * to spaces, collapses whitespace runs, deduplicates tokens (preserving order),
 * and trims. Both null/empty → null.
 *
 * Example: ("Tylenol Extra Strength", "acetaminophen") → "tylenol extra strength acetaminophen"
 * Example: ("Silicea", "SILICEA") → "silicea" (deduped)
 */
export function normalizeDrugName(
  brand: string | null,
  generic: string | null
): string | null {
  const parts: string[] = []
  if (brand && brand.trim().length > 0) parts.push(brand.trim())
  if (generic && generic.trim().length > 0) parts.push(generic.trim())
  if (parts.length === 0) return null

  const combined = parts.join(' ')
  // Lowercase, replace non-alphanumeric with space
  const normalized = combined.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  // Split into tokens, deduplicate preserving first occurrence order
  const rawTokens = normalized.split(/\s+/).filter((t) => t.length > 0)
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const token of rawTokens) {
    if (!seen.has(token)) {
      seen.add(token)
      deduped.push(token)
    }
  }

  const result = deduped.join(' ').trim()
  return result.length > 0 ? result : null
}

/**
 * Parse the download.json manifest into a typed DrugLabelManifest.
 *
 * Throws a descriptive error if:
 *   - `results.drug.label` is missing (manifest shape changed upstream)
 *   - The `partitions` array is absent or empty
 *
 * Partitions missing a `file` field are skipped with a warning logged to
 * stderr so the caller can decide whether to abort.
 *
 * @param json - The parsed JSON object from GET https://api.fda.gov/download.json
 */
export function parseDrugLabelManifest(json: unknown): DrugLabelManifest {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Unexpected FDA manifest format: root is not an object')
  }

  const root = json as Record<string, unknown>
  const results = root['results'] as Record<string, unknown> | undefined
  if (!results || typeof results !== 'object') {
    throw new Error('Unexpected FDA manifest format: missing "results"')
  }

  const drug = results['drug'] as Record<string, unknown> | undefined
  if (!drug || typeof drug !== 'object') {
    throw new Error('Unexpected FDA manifest format: missing "results.drug"')
  }

  const label = drug['label'] as Record<string, unknown> | undefined
  if (!label || typeof label !== 'object') {
    throw new Error('Unexpected FDA manifest format: missing "results.drug.label"')
  }

  const export_date = label['export_date']
  if (typeof export_date !== 'string' || export_date.trim() === '') {
    throw new Error('Unexpected FDA manifest format: missing or invalid "export_date"')
  }

  const total_records = label['total_records']
  if (typeof total_records !== 'number') {
    throw new Error('Unexpected FDA manifest format: missing or invalid "total_records"')
  }

  const rawPartitions = label['partitions']
  if (!Array.isArray(rawPartitions) || rawPartitions.length === 0) {
    throw new Error(
      'Unexpected FDA manifest format: "partitions" is missing or empty'
    )
  }

  const partitions: DrugLabelPartition[] = []
  for (const p of rawPartitions as unknown[]) {
    if (typeof p !== 'object' || p === null) {
      process.stderr.write('[parseDrugLabelManifest] Skipping non-object partition\n')
      continue
    }
    const part = p as Record<string, unknown>
    if (typeof part['file'] !== 'string' || (part['file'] as string).trim() === '') {
      process.stderr.write(
        `[parseDrugLabelManifest] Skipping partition with missing "file": ${JSON.stringify(part)}\n`
      )
      continue
    }
    partitions.push({
      display_name: typeof part['display_name'] === 'string' ? part['display_name'] : '',
      file: (part['file'] as string).trim(),
      size_mb: typeof part['size_mb'] === 'string' ? part['size_mb'] : '0',
      records: typeof part['records'] === 'number' ? part['records'] : 0,
    })
  }

  if (partitions.length === 0) {
    throw new Error(
      'Unexpected FDA manifest format: all partitions were invalid (missing "file" field)'
    )
  }

  return {
    export_date: export_date.trim(),
    total_records,
    partitions,
  }
}

// ─── Two-step ingest helpers (pure — no I/O) ──────────────────────────────────

/**
 * Resolve the on-disk path of a part's zip from its manifest partition.
 *
 * The download job stages each part to `<storageBase>/<basename-of-file-URL>`;
 * both the download job (write) and the ingest job (read) must agree on this
 * path. Extracting it here (pure: path.basename + path.join do no I/O) lets both
 * jobs and the tests share one definition instead of inlining the join twice.
 */
export function partZipPath(storageBase: string, partition: DrugLabelPartition): string {
  return path.join(storageBase, path.basename(partition.file))
}

/**
 * Sum the manifest partitions' `size_mb` into a single byte total for the Active
 * Downloads card's `totalBytes`. Each partition's `size_mb` is a string of MB in
 * the openFDA manifest; a non-numeric / missing value contributes 0 so a single
 * bad partition can't NaN the whole total. Pure (no I/O) so the producer and the
 * standalone test share one definition.
 */
export function manifestBytesTotal(manifest: DrugLabelManifest): number {
  return manifest.partitions.reduce((acc, p) => {
    const mb = Number(p.size_mb)
    return acc + (Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 0)
  }, 0)
}

/**
 * Is the manifest's `export_date` newer than the last-ingested one? Drives the
 * drug auto-update freshness check.
 *
 * TODO(maintainer Q3): CONFIRM the openFDA `export_date` string format before
 * trusting this. We only have it typed as `string` in the code; the format
 * (e.g. `YYYY-MM-DD` vs `YYYYMMDD` vs `MM/DD/YYYY`) determines whether a plain
 * lexicographic `>` sorts chronologically. This implementation is defensive: it
 * FIRST tries Date.parse on both sides and compares timestamps (correct for any
 * parseable date string, including ISO and US formats); only if EITHER side
 * fails to parse does it fall back to a trimmed lexicographic compare (correct
 * for zero-padded ISO `YYYY-MM-DD` / `YYYYMMDD`). The fallback can misfire on a
 * non-ISO, non-parseable format — hence the maintainer confirmation. Either way
 * it never throws and treats an unset/empty `last` as "newer" (a first install
 * with no baseline should update). Pure: no I/O, fully unit-testable.
 */
export function isExportDateNewer(latest: string, last: string | null | undefined): boolean {
  const l = (latest ?? '').trim()
  const prev = (last ?? '').trim()
  if (l === '') return false // no candidate → nothing to update to
  if (prev === '') return true // no baseline → treat any valid candidate as newer
  if (l === prev) return false // identical → already current

  const lt = Date.parse(l)
  const pt = Date.parse(prev)
  if (Number.isFinite(lt) && Number.isFinite(pt)) {
    return lt > pt
  }
  // Fallback: lexicographic. Correct only for zero-padded ISO-ordered strings.
  return l > prev
}

/**
 * Defensively parse the `drugReference.downloadState` KV marker.
 *
 * Follows the kv_store defensive-parse convention: a never-set (null) value,
 * malformed JSON, or a structurally-wrong object all return null so callers fall
 * back to "nothing downloaded" rather than throwing. A valid marker must carry a
 * non-empty parts array with a string path on each entry.
 */
export function parseDownloadState(raw: string | null): DownloadStateMarker | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const m = parsed as Record<string, unknown>
  if (typeof m.export_date !== 'string') return null
  if (typeof m.totalParts !== 'number') return null
  if (!Array.isArray(m.parts) || m.parts.length === 0) return null

  const parts: DownloadStateMarker['parts'] = []
  for (const p of m.parts as unknown[]) {
    if (typeof p !== 'object' || p === null) return null
    const part = p as Record<string, unknown>
    if (typeof part.path !== 'string' || part.path.trim() === '') return null
    parts.push({
      index: typeof part.index === 'number' ? part.index : parts.length,
      name: typeof part.name === 'string' ? part.name : '',
      path: part.path,
      bytes: typeof part.bytes === 'number' ? part.bytes : 0,
    })
  }

  return {
    export_date: m.export_date,
    totalParts: m.totalParts,
    // Older markers (written before totalRecords existed) parse back as 0 =
    // "unknown"; callers fall back to a parts-based estimate in that case.
    totalRecords: typeof m.totalRecords === 'number' ? m.totalRecords : 0,
    parts,
    completedAtMs: typeof m.completedAtMs === 'number' ? m.completedAtMs : 0,
  }
}

/**
 * Resolve the ingest "expected total" denominator — the ~259k that drives the
 * "X of ~N labels" counter, the records-based progress %, and the ETA.
 *
 * Precedence (first known value wins, where "known" means > 0):
 *   1. the manifest's real `total_records` (~259k) — carried in job data on the
 *      auto-chained run, or rebuilt from the persisted download marker;
 *   2. a parts-based estimate (`totalParts * 20000`) when the manifest total is
 *      not yet known (e.g. an older marker, or before the manifest is resolved);
 *   3. the live row count as a last resort.
 *
 * The bug this fixes: `total_records ?? fallback` returns 0 when total_records
 * is 0, because 0 is not nullish — so the fallback was never reached and the
 * counter/%/ETA silently disappeared. Treating 0 as "unknown" restores them.
 */
export function resolveExpectedTotal(
  manifestTotalRecords: number | undefined,
  totalParts: number | undefined,
  rowCount: number,
  perPartEstimate = 20000
): number {
  if (manifestTotalRecords && manifestTotalRecords > 0) return manifestTotalRecords
  if (totalParts && totalParts > 0) return totalParts * perPartEstimate
  return rowCount
}

/**
 * Resolve the ingested-record count the UI shows during the 'ingesting' phase.
 *
 * The bug this fixes: the per-job `recordsIngested` counter lags during the
 * per-part continuation handoff. Pass 0 runs under the deterministic jobId and
 * carries its count in job data; continuations (parts 2+) run under auto-ids and
 * each only know the running total written into *their* job data mid-batch, so
 * the number the status read surfaces can stall while the DB keeps filling.
 *
 * The live `drug_labels` row count is ground truth, but it is only a faithful
 * progress signal on a FIRST ingest — an empty (or near-empty) table climbs
 * 0 → ~259k as rows land. On a re-ingest into an already-populated table the row
 * count barely moves (upserts replace existing rows), so it would understate
 * progress; there the per-job `recordsIngested` is the better source.
 *
 * `startRowCount` is the table's row count when THIS RUN began (pass 0 stamps
 * it into job data; continuations carry it). It fixes the re-ingest lie: into a
 * populated table, raw rowCount made the counter read ~100% from second zero.
 * The live-table progress signal for this run is rowCount - startRowCount (new
 * rows only); jobRecords covers the upsert-update case where the table count
 * barely moves. Taking max of the two:
 *   - first ingest (start 0): identical to the old max(jobRecords, rowCount);
 *   - re-ingest: rowCount - start stays near 0, jobRecords climbs 0 → ~259k and
 *     drives the counter honestly.
 *
 * Clamped to `expectedTotal` (when known) so the count can't briefly read past
 * the denominator and push the bar over 100%.
 */
export function resolveIngestRecordsShown(
  jobRecords: number,
  rowCount: number,
  expectedTotal: number,
  startRowCount = 0
): number {
  const newRows = Math.max(0, rowCount - Math.max(0, startRowCount))
  const best = Math.max(jobRecords, newRows)
  if (expectedTotal > 0) return Math.min(best, expectedTotal)
  return best
}

/**
 * Reduce a raw job failure message to something a human can read in the UI.
 *
 * A knex/mysql2 error message embeds the ENTIRE failed SQL statement — for a
 * 500-row drug-label insert that is thousands of characters of SQL plus full
 * label text, which the status panel then rendered verbatim (a wall of red).
 * The meaningful part is the driver error the database appended at the END
 * ("Duplicate entry … for key …", "Data too long for column …", etc.).
 *
 * Strategy: match the known MySQL driver-error shapes anywhere in the message
 * and return just that sentence; otherwise fall back to the first line,
 * hard-capped. Pure + unit-testable.
 */
export function summarizeJobError(raw: string | null | undefined, maxLen = 300): string | undefined {
  if (!raw) return undefined
  const msg = String(raw).trim()
  if (!msg) return undefined

  const driverPatterns: RegExp[] = [
    /Duplicate entry .{0,120}? for key '[^']+'/,
    /Data too long for column '[^']+'[^\n]{0,80}/,
    /Incorrect \w+ value: .{0,120}/,
    /Unknown column '[^']+' in '[^']+'/,
    /Deadlock found[^\n]{0,120}/,
    /Lock wait timeout[^\n]{0,120}/,
    /ER_[A-Z_]+[^\n]{0,160}/,
    /connect ECONNREFUSED [^\s]+/,
    /timed out after \d+ms[^\n]{0,160}/,
  ]
  for (const pat of driverPatterns) {
    const m = msg.match(pat)
    if (m) return m[0].slice(0, maxLen)
  }

  // No recognizable driver error — take the first line, capped. A leading
  // "insert into `drug_labels` (…)" dump is all one line, so the cap is what
  // actually saves the UI here.
  const firstLine = msg.split('\n')[0]
  return firstLine.length > maxLen ? `${firstLine.slice(0, maxLen)}…` : firstLine
}

/**
 * Derive the top-level ingest phase from the two sub-phase states + the live row
 * count. This is the state machine the UI keys off of:
 *
 *   - ingest running                          → 'ingesting'
 *   - download running                        → 'downloading'
 *   - either phase failed (ingest wins)       → 'failed'
 *   - ingest completed (or rows already exist
 *     with no active work)                    → 'ready'
 *   - download completed, ingest not done     → 'downloaded'
 *   - nothing happening, no rows              → 'idle'
 *
 * Ordering matters: an in-flight phase is reported before a terminal one so a
 * re-ingest after a prior success shows 'ingesting', not 'ready'. A failed
 * download does NOT force the ingest phase to fail (and vice-versa) — only the
 * phase that actually failed surfaces, and a running phase always outranks a
 * sibling failure.
 */
export function deriveIngestPhase(
  download: DrugDownloadStatus,
  ingest: DrugIngestPhaseStatus,
  rowCount: number
): DrugIngestPhase {
  if (ingest.state === 'running') return 'ingesting'
  if (download.state === 'running') return 'downloading'
  // No phase is actively running below this point.
  if (ingest.state === 'failed') return 'failed'
  if (download.state === 'failed') return 'failed'
  if (ingest.state === 'completed') return 'ready'
  if (download.state === 'completed') return 'downloaded'
  // Idle: surface 'ready' if there is already searchable data from a past run.
  if (rowCount > 0) return 'ready'
  return 'idle'
}
