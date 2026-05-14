import type { KbIngestStateValue } from '../../types/kb_ingest_state.js'

/**
 * Decision returned by `decideScanAction` describing what scanAndSyncStorage
 * should do for one file given its current state row (if any) and whether
 * Qdrant already has chunks for it.
 *
 * - `skip` — file is in a settled state (already indexed, deliberately not
 *   indexed, or in a manual-recovery state); no auto-dispatch.
 * - `dispatch` — file needs to be (re-)embedded; an EmbedFileJob should be
 *   dispatched. `createStateRow` indicates whether a new state row needs to
 *   be created before dispatch (i.e. first time the scanner has seen it).
 * - `backfill_indexed` — Qdrant has chunks but no state row exists yet
 *   (pre-RFC install, or new admin instance pointed at an existing Qdrant
 *   volume). Create a row in `indexed` state without re-embedding.
 */
export type ScanAction =
  | { kind: 'skip' }
  | { kind: 'dispatch'; createStateRow: boolean }
  | { kind: 'backfill_indexed' }

export interface KbIngestStateRow {
  state: KbIngestStateValue
}

/**
 * Decide what scanAndSyncStorage should do for a single embeddable file.
 *
 * Replaces the earlier `!sourcesInQdrant.has(filePath)` binary check, which
 * couldn't tell a fully-indexed file from a stalled mid-batch ingestion, and
 * couldn't honor a user's "browse only" choice. The state row is now the
 * authoritative answer; Qdrant chunk presence is corroborating evidence.
 */
export function decideScanAction(
  stateRow: KbIngestStateRow | null,
  hasChunksInQdrant: boolean
): ScanAction {
  if (!stateRow) {
    if (hasChunksInQdrant) return { kind: 'backfill_indexed' }
    return { kind: 'dispatch', createStateRow: true }
  }

  switch (stateRow.state) {
    case 'indexed':
      return hasChunksInQdrant ? { kind: 'skip' } : { kind: 'dispatch', createStateRow: false }
    case 'pending_decision':
      return { kind: 'dispatch', createStateRow: false }
    case 'browse_only':
    case 'failed':
    case 'stalled':
      return { kind: 'skip' }
  }
}
