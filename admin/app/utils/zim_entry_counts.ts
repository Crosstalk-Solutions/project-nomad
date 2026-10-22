/**
 * Entry-type census of a ZIM archive (#1445).
 *
 * The Knowledge Base extractor indexes a ZIM's HTML pages and skips everything
 * else, PDFs included. Some archives, NOMAD's own Medicine and Survival tiers
 * among them, are a one-page HTML shell around a shelf of PDF books, so they
 * index to one or two chunks and show as healthy. Counting the entry types
 * once, when indexing starts, lets the Stored Files row say what was skipped.
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
 * Indexed ZIM rows below this chunk count get a one-time census during the
 * storage scan if they have none. A shelf of PDFs behind a shell page yields a
 * handful of chunks; anything with real HTML content is far above this and
 * would already have embedded its text.
 */
export const ZIM_CENSUS_BACKFILL_MAX_CHUNKS = 100

export interface ZimCensusRow {
  state: string
  chunks_embedded: number
  html_entries: number | null
  pdf_entries: number | null
}

/** Should the storage scan take the entry census for this already-indexed ZIM now? */
export function shouldBackfillZimEntryCensus(filePath: string, row: ZimCensusRow): boolean {
  return (
    filePath.toLowerCase().endsWith('.zim') &&
    row.state === 'indexed' &&
    row.html_entries === null &&
    row.pdf_entries === null &&
    row.chunks_embedded < ZIM_CENSUS_BACKFILL_MAX_CHUNKS
  )
}
