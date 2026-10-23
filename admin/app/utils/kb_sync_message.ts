/**
 * The one-line result of a Knowledge Base storage sync, as shown by the
 * "Sync" button (#1465).
 *
 * The message used to look only at what was queued for embedding, so a sync
 * that had just added files to Stored Files (Manual policy: rows created as
 * `pending_decision`, waiting for the user) still answered "already in sync".
 */
export interface KbSyncOutcome {
  filesScanned: number
  /** Embed jobs dispatched by this sync. */
  queued: number
  /** Files that already had a job queued, so none was added. */
  deduped: number
  /** Rows created as `pending_decision` (Manual policy), waiting for the user. */
  createdPending: number
  /** Rows created as `indexed` for files that already had chunks in Qdrant. */
  backfilled: number
  /** Trailing notes from the orphan sweep, starting with "; " or empty. */
  note: string
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export function describeKbSyncOutcome(o: KbSyncOutcome): string {
  const parts: string[] = []
  if (o.queued > 0) {
    parts.push(
      `queued ${o.queued} for embedding${o.deduped > 0 ? ` (${o.deduped} already queued)` : ''}`
    )
  }
  if (o.createdPending > 0) {
    parts.push(
      `added ${count(o.createdPending, 'file')} to Stored Files, waiting for you to index ${o.createdPending === 1 ? 'it' : 'them'}`
    )
  }
  if (o.backfilled > 0) {
    parts.push(`recorded ${count(o.backfilled, 'already-indexed file')}`)
  }
  if (parts.length === 0) return `Knowledge base is already in sync${o.note}`
  return `Scanned ${o.filesScanned} files, ${parts.join(', ')}${o.note}`
}
