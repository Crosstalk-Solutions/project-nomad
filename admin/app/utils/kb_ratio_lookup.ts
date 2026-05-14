export interface RatioRow {
  pattern: string
  chunks_per_mb: number
}

/**
 * Bytes of on-disk storage one embedded chunk consumes inside Qdrant.
 *
 * Rough composition for our pipeline:
 *   - vector: 768 dims × float32 = 3,072 B
 *   - chunk text payload: ~3,000 B (target 1,500 tokens × 2 chars/token)
 *   - source/metadata payload + Qdrant indexes: ~2,000 B
 *
 * Used for surfacing pre-ingest disk-cost estimates; the actual figure
 * varies with collection params and will be replaced by self-calibration
 * (RFC #883 Phase 4) once we have real measurements.
 */
export const BYTES_PER_CHUNK_ON_DISK = 8_000

export interface BatchEstimateInput {
  filename: string
  sizeBytes: number
}

export interface BatchEstimate {
  totalChunks: number
  totalBytes: number
  hasUnknown: boolean
}

/**
 * Aggregate an embedding-disk-cost estimate across a batch of files (curated
 * tier add, multi-upload, sync preview, etc). `hasUnknown` is true when at
 * least one file did not match any registry row — the totals only include
 * matched files, so callers should annotate "estimate excludes unknown files"
 * when surfacing the figure.
 */
export function estimateBatch(
  files: BatchEstimateInput[],
  rows: RatioRow[]
): BatchEstimate {
  let totalChunks = 0
  let hasUnknown = false
  for (const f of files) {
    const chunks = estimateChunkCount(f.filename, f.sizeBytes, rows)
    if (chunks === null) {
      hasUnknown = true
    } else {
      totalChunks += chunks
    }
  }
  return {
    totalChunks,
    totalBytes: totalChunks * BYTES_PER_CHUNK_ON_DISK,
    hasUnknown,
  }
}

/**
 * Pick the chunks_per_mb estimate for a filename by longest-prefix match.
 *
 * Patterns are filename prefixes (`devdocs_`, `wikipedia_en_simple_`, ...).
 * The longest matching prefix wins, so a specific entry (`wikipedia_en_simple_`)
 * overrides the broader fallback (`wikipedia_en_`). An empty-string pattern in
 * the registry serves as a catch-all that matches every input.
 *
 * Returns `null` if no row matches and no empty-string fallback is present —
 * caller decides whether to surface "unknown" or use its own default.
 */
export function findChunksPerMb(filename: string, rows: RatioRow[]): number | null {
  let best: RatioRow | null = null
  for (const row of rows) {
    if (!filename.startsWith(row.pattern)) continue
    if (best === null || row.pattern.length > best.pattern.length) {
      best = row
    }
  }
  return best === null ? null : best.chunks_per_mb
}

/**
 * Estimate the number of embedding chunks a ZIM-style file will produce given
 * its size on disk in bytes. Returns `null` when the registry has nothing to
 * match against. Caller is responsible for converting the estimate into either
 * a disk-footprint estimate (chunks × bytes-per-chunk in Qdrant) or a time
 * estimate (chunks ÷ chunks-per-minute-on-this-hardware).
 */
export function estimateChunkCount(
  filename: string,
  fileSizeBytes: number,
  rows: RatioRow[]
): number | null {
  const ratio = findChunksPerMb(filename, rows)
  if (ratio === null) return null
  const megabytes = fileSizeBytes / (1024 * 1024)
  return Math.round(ratio * megabytes)
}
