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
 */
export type FileWarning =
  | { kind: 'zero_chunks'; fileSizeBytes: number }
  | { kind: 'partial_stall'; chunksEmbedded: number; chunksExpected: number }

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
}

export function decideWarnings(inputs: WarningInputs): FileWarning[] {
  const warnings: FileWarning[] = []

  // Warning A: file is large but produced nothing. Almost always a video-only
  // or image-only ZIM; AI Assistant literally cannot reference this content.
  if (
    inputs.chunksInQdrant === 0 &&
    inputs.fileSizeBytes > ZERO_CHUNKS_MIN_SIZE_BYTES
  ) {
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

  return warnings
}
