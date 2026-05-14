export interface RatioRow {
  pattern: string
  chunks_per_mb: number
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
