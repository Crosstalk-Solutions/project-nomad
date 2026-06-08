/**
 * Decision for reconciling the AI knowledge base (Qdrant) after a curated
 * content file (a ZIM) is replaced by a newer downloaded version.
 *
 * This is the pure, I/O-free core of `RagService.reconcileReplacedContentFile`.
 * Keeping the branching here (mirrors `decideScanAction` in
 * `kb_ingest_decision.ts`) makes the contract exhaustively testable without a
 * database or a live Qdrant.
 *
 * The logic deliberately MIRRORS the replaced file's prior indexed state rather
 * than applying the global `rag.defaultIngestPolicy`: on a content *update* the
 * user has already made an indexing choice for this content, so we honor it in
 * both directions (re-index a previously-indexed file even under Manual; leave a
 * previously-unindexed file alone even under Always). Fresh installs still go
 * through the normal policy path — those return `not_a_replacement` here.
 *
 * Outcomes (evaluated top-down, short-circuiting):
 * - `not_a_replacement` — no prior file, or the new file has the same path
 *   (same-version re-download). Caller defers to normal ingest policy.
 * - `qdrant_not_installed` (step 2) — no knowledge base exists; nothing to do.
 * - `old_not_indexed` (step 4) — the replaced file was never embedded
 *   (no state row, or state ≠ `indexed`); leave the new file un-indexed.
 * - `qdrant_not_running` (step 5) — the replaced file WAS indexed but Qdrant is
 *   currently offline. We do nothing: we can't remove the stale points, and a
 *   queued embed job could be dropped before Qdrant returns. Acting half-way is
 *   wasteful, so we defer entirely (accepted tradeoff: stale points linger).
 * - `reindex` (step 3) — the replaced file was indexed and Qdrant is running:
 *   delete ONLY the old file's points, drop its state row, and queue the new
 *   file for embedding.
 *
 * Note the install-before-indexed ordering: step 2 short-circuits before any KB
 * state lookup, matching the spec.
 */
export type ReindexOutcome =
  | 'not_a_replacement'
  | 'qdrant_not_installed'
  | 'old_not_indexed'
  | 'qdrant_not_running'
  | 'reindex'

export interface ContentReindexInput {
  /** The replaced file existed AND its path differs from the new file's path. */
  isReplacement: boolean
  /** `nomad_qdrant` service exists (installed), regardless of running state. */
  qdrantInstalled: boolean
  /** The replaced file's `KbIngestState.state === 'indexed'`. */
  oldFileWasIndexed: boolean
  /** Qdrant answered a live health check (currently reachable). */
  qdrantRunning: boolean
}

export function decideContentReindex(input: ContentReindexInput): ReindexOutcome {
  if (!input.isReplacement) return 'not_a_replacement'
  if (!input.qdrantInstalled) return 'qdrant_not_installed'
  if (!input.oldFileWasIndexed) return 'old_not_indexed'
  if (!input.qdrantRunning) return 'qdrant_not_running'
  return 'reindex'
}
