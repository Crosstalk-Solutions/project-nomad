import type { IngestPolicy } from './kb_ingest_decision.js'

/**
 * Decision for reconciling the AI knowledge base (Qdrant) after a curated
 * content file (a ZIM) is replaced by a newer downloaded version.
 *
 * This is the pure, I/O-free core of `RagService.reconcileReplacedContentFile`.
 * Keeping the branching here (mirrors `decideScanAction` in
 * `kb_ingest_decision.ts`) makes the contract exhaustively testable without a
 * database or a live Qdrant.
 *
 * The logic MIRRORS the replaced file's prior indexed state: a previously
 * un-indexed file is left alone even under Always, and only a previously-indexed
 * file is ever considered for re-embedding. The global `rag.defaultIngestPolicy`
 * is then consulted as the final gate: under Manual a replacement must NOT
 * auto-embed (#1455). A collection update can swap many large ZIMs at once, and
 * silently re-embedding them for hours is exactly what Manual exists to prevent
 * — the same contract the post-download (#919) and local-upload (#1184) paths
 * already honor. Fresh installs still go through the normal policy path — those
 * return `not_a_replacement` here.
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
 * - `reindex` (step 3) — the replaced file was indexed, Qdrant is running and
 *   the policy is Always: delete ONLY the old file's points, drop its state
 *   row, and queue the new file for embedding.
 * - `pending_decision` (step 3, Manual) — same as `reindex` except the new
 *   file is NOT queued: the stale points of the old version are still purged
 *   (they describe content no longer on disk), and the new file is recorded as
 *   `pending_decision` like any new file so the KB panel offers the per-file
 *   Index affordance (#1455).
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
  | 'pending_decision'

export interface ContentReindexInput {
  /** The replaced file existed AND its path differs from the new file's path. */
  isReplacement: boolean
  /** `nomad_qdrant` service exists (installed), regardless of running state. */
  qdrantInstalled: boolean
  /** The replaced file's `KbIngestState.state === 'indexed'`. */
  oldFileWasIndexed: boolean
  /** Qdrant answered a live health check (currently reachable). */
  qdrantRunning: boolean
  /**
   * Global `rag.defaultIngestPolicy`. Optional so the pre-#1455 call shape keeps
   * its meaning; unset is treated as `Always`, matching `decideScanAction`.
   */
  policy?: IngestPolicy
}

export function decideContentReindex(input: ContentReindexInput): ReindexOutcome {
  if (!input.isReplacement) return 'not_a_replacement'
  if (!input.qdrantInstalled) return 'qdrant_not_installed'
  if (!input.oldFileWasIndexed) return 'old_not_indexed'
  if (!input.qdrantRunning) return 'qdrant_not_running'
  return input.policy === 'Manual' ? 'pending_decision' : 'reindex'
}
