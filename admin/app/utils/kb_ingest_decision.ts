import type { KbIngestStateValue } from '../../types/kb_ingest_state.js'

/**
 * Decision returned by `decideScanAction` describing what scanAndSyncStorage
 * should do for one file given its current state row (if any), whether Qdrant
 * already has chunks for it, and the global ingest policy.
 *
 * - `skip` — file is in a settled state (already indexed, deliberately not
 *   indexed, or in a manual-recovery state); no auto-dispatch.
 * - `dispatch` — file needs to be (re-)embedded; an EmbedFileJob should be
 *   dispatched. `createStateRow` indicates whether a new state row needs to
 *   be created before dispatch (i.e. first time the scanner has seen it).
 * - `backfill_indexed` — Qdrant has chunks but no state row exists yet
 *   (pre-RFC install, or new admin instance pointed at an existing Qdrant
 *   volume). Create a row in `indexed` state without re-embedding.
 * - `create_pending` — Manual mode: record that we've seen the file but
 *   don't dispatch. Frontend surfaces a per-card "Index" affordance.
 */
export type ScanAction =
  | { kind: 'skip' }
  | { kind: 'dispatch'; createStateRow: boolean }
  | { kind: 'backfill_indexed' }
  | { kind: 'create_pending' }

export interface KbIngestStateRow {
  state: KbIngestStateValue
}

/**
 * Global auto-index policy stored at KV `rag.defaultIngestPolicy`. Unset is
 * treated as `Always` so existing installs keep their current behavior until
 * the user opts into Manual mode through the KB panel.
 */
export type IngestPolicy = 'Always' | 'Manual'

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
  hasChunksInQdrant: boolean,
  policy: IngestPolicy = 'Always'
): ScanAction {
  if (!stateRow) {
    if (hasChunksInQdrant) return { kind: 'backfill_indexed' }
    return policy === 'Always'
      ? { kind: 'dispatch', createStateRow: true }
      : { kind: 'create_pending' }
  }

  switch (stateRow.state) {
    case 'indexed':
      return hasChunksInQdrant ? { kind: 'skip' } : { kind: 'dispatch', createStateRow: false }
    case 'pending_decision':
      // Manual mode: file is waiting for the user to opt in via per-card Index.
      // Always mode: treat as "user-equivalent of auto-index" and dispatch.
      return policy === 'Always'
        ? { kind: 'dispatch', createStateRow: false }
        : { kind: 'skip' }
    case 'browse_only':
    case 'failed':
    case 'stalled':
      return { kind: 'skip' }
  }
}
