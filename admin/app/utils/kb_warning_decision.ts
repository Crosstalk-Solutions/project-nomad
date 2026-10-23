/**
 * Conditional warnings surfaced on Stored Files rows in the KB panel.
 * See RFC #883 §6 — these warnings appear ONLY when their triggering condition
 * is met, never on healthy files, to keep the panel silent in the common case.
 *
 * - `zero_chunks`   — a non-trivial file produced 0 embedding chunks. Common
 *                     cause: video-only or image-only ZIMs that the pipeline
 *                     completes "successfully" with no extractable text.
 *                     AI Assistant cannot reference this content.
 * - `partial_stall` — the file has embedded chunks but well below the count
 *                     expected from the ratio registry. Likely a mid-batch
 *                     stall (which the binary "any chunks ⇒ embedded" check
 *                     used to mask). Surfaces a Retry affordance.
 * - `pdf_entries_skipped` — a ZIM whose entries are mostly PDF documents. The
 *                     extractor indexes only HTML, so the archive's books are
 *                     not in the Knowledge Base even though its one or two
 *                     shell pages produced chunks and the row reads as
 *                     healthy. (#1445)
 */
import type { FileWarning } from '../../types/rag.js'

export type { FileWarning }

/** Files smaller than this are too small to flag as suspicious zero-chunk
 *  cases — a 5 KB upload that produces 0 chunks is much more likely to be a
 *  legitimate edge case (placeholder file) than the gigabyte-scale video ZIM
 *  problem this warning targets. */
export const ZERO_CHUNKS_MIN_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB

/** Fraction of expected chunks below which we consider a file partially
 *  stalled. 0.5 (50%) matches the threshold described in RFC #883 §6 Warning B. */
export const PARTIAL_STALL_RATIO_THRESHOLD = 0.5

export interface WarningInputs {
  /** Source file size on disk in bytes. */
  fileSizeBytes: number
  /** Distinct chunks present in Qdrant for this source. */
  chunksInQdrant: number
  /** Best estimate of chunks the file should produce, from the ratio
   *  registry. `null` when no registry pattern matches and no fallback is
   *  configured — Warning B is suppressed in that case (we'd rather be silent
   *  than wrong). */
  expectedChunks: number | null
  /** ZIM entry census from `kb_ingest_state` (null: not a ZIM, or indexed
   *  before the census existed). Drives Warning C. */
  htmlEntries?: number | null
  pdfEntries?: number | null
}

/** Warning C fires when at least this share of a ZIM's indexable-or-PDF
 *  entries are PDFs. 0.5 means "PDFs are at least half": a shelf of books
 *  behind a shell page is ~85–95%, a text site with a few attached PDFs is
 *  well under. */
export const PDF_ENTRIES_SHARE_THRESHOLD = 0.5

export function decideWarnings(inputs: WarningInputs): FileWarning[] {
  const warnings: FileWarning[] = []

  // Warning A: file is large but produced nothing. Almost always a video-only
  // or image-only ZIM; AI Assistant literally cannot reference this content.
  if (inputs.chunksInQdrant === 0 && inputs.fileSizeBytes > ZERO_CHUNKS_MIN_SIZE_BYTES) {
    warnings.push({ kind: 'zero_chunks', fileSizeBytes: inputs.fileSizeBytes })
  }

  // Warning B: chunks present but far below expectation. Suppresses when we
  // have no expectation (registry miss) since the comparison would be
  // meaningless and we'd rather under-warn than mislead.
  if (
    inputs.expectedChunks !== null &&
    inputs.expectedChunks > 0 &&
    inputs.chunksInQdrant > 0 &&
    inputs.chunksInQdrant < inputs.expectedChunks * PARTIAL_STALL_RATIO_THRESHOLD
  ) {
    warnings.push({
      kind: 'partial_stall',
      chunksEmbedded: inputs.chunksInQdrant,
      chunksExpected: inputs.expectedChunks,
    })
  }

  // Warning C: the ZIM is a PDF collection the extractor cannot read. Fires
  // whatever the chunk count, because the shell pages always yield a chunk or
  // two and that is exactly what hides the problem.
  const pdfEntries = inputs.pdfEntries ?? null
  const htmlEntries = inputs.htmlEntries ?? null
  if (
    pdfEntries !== null &&
    htmlEntries !== null &&
    pdfEntries > 0 &&
    pdfEntries >= (pdfEntries + htmlEntries) * PDF_ENTRIES_SHARE_THRESHOLD
  ) {
    warnings.push({ kind: 'pdf_entries_skipped', pdfEntries, htmlEntries })
  }

  return warnings
}
