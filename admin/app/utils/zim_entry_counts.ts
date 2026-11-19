/**
 * Entry-type census of a ZIM archive (#1445).
 *
 * The Knowledge Base extractor indexes a ZIM's HTML pages and skips everything
 * else, PDFs included. Some archives, NOMAD's own Medicine and Survival tiers
 * among them, are a one-page HTML shell around a shelf of PDF books, so they
 * index to one or two chunks and show as healthy. Counting the entry types
 * lets the Stored Files row say what was, or will be, skipped.
 */

export type ZimEntryKind = 'html' | 'pdf' | 'other'

export interface ZimEntryCounts {
  html: number
  pdf: number
  other: number
}

/** Classify one entry by its MIME type, the same way the extractor picks articles. */
export function classifyZimEntry(mimeType: string | undefined): ZimEntryKind {
  if (mimeType === 'text/html' || mimeType === 'application/xhtml+xml') return 'html'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'other'
}

export function emptyZimEntryCounts(): ZimEntryCounts {
  return { html: 0, pdf: 0, other: 0 }
}

/**
 * Parse the `Counter` metadata entry that the ZIM writer stores in modern
 * archives: `text/html=14940;application/pdf=2851;image/jpeg=7842;...`.
 * One metadata read replaces a walk over every entry. Returns null when the
 * value is missing or holds no usable `mimetype=count` pair.
 */
export function parseZimCounterMetadata(counter: string | null | undefined): ZimEntryCounts | null {
  if (!counter) return null
  const counts = emptyZimEntryCounts()
  let pairs = 0
  for (const field of counter.split(';')) {
    const eq = field.lastIndexOf('=')
    if (eq <= 0) continue
    const count = Number(field.slice(eq + 1).trim())
    if (!Number.isInteger(count) || count < 0) continue
    counts[classifyZimEntry(field.slice(0, eq).trim())] += count
    pairs++
  }
  return pairs > 0 ? counts : null
}

/**
 * An indexed ZIM row at or below this chunk count carries the PDF-shelf
 * signature (a shell page or two in front of the books), so a storage sync
 * may walk its entries when the archive has no `Counter` metadata. Anything
 * with real HTML content is far above this and would already have embedded
 * its text.
 */
export const ZIM_CENSUS_FULL_SCAN_MAX_CHUNKS = 100

/**
 * How much a storage sync may spend on the census of one ZIM row.
 *
 * - `none`: not a ZIM, or the row already has a census.
 * - `full`: an indexed ZIM that produced only a handful of chunks. Worth a
 *   walk over the entries even when the archive lacks `Counter` metadata.
 * - `metadata_only`: everything else, including rows that are not indexed
 *   yet (Manual policy) and large indexed ZIMs. Read the `Counter` metadata,
 *   which is instant, and leave the row uncensused if the archive has none.
 */
export type ZimCensusPlan = 'none' | 'metadata_only' | 'full'

export interface ZimCensusRow {
  state: string
  chunks_embedded: number
  /** Null or undefined when no census was taken: a row fresh from `create()`
   *  leaves unset columns undefined, one loaded from the table has null. */
  html_entries?: number | null
  pdf_entries?: number | null
}

export function planZimEntryCensus(filePath: string, row: ZimCensusRow): ZimCensusPlan {
  if (!filePath.toLowerCase().endsWith('.zim')) return 'none'
  if (typeof row.html_entries === 'number' || typeof row.pdf_entries === 'number') return 'none'
  if (row.state === 'indexed' && row.chunks_embedded <= ZIM_CENSUS_FULL_SCAN_MAX_CHUNKS) {
    return 'full'
  }
  return 'metadata_only'
}
