import type { IngestPolicy } from './kb_ingest_decision.js'

/**
 * What RunDownloadJob does for the Knowledge Base once a ZIM has landed on
 * disk (#1465).
 *
 * Easy Setup starts the service installs and the content downloads at the
 * same time, so a small ZIM usually finishes minutes before the AI Assistant
 * (Ollama) exists. The `kb_ingest_state` row is bookkeeping, not an AI
 * action: without it the file never appears in Stored Files and, under
 * policy Always, is never embedded. So the row is recorded regardless of
 * whether Ollama is installed; only the actions that need Ollama wait for it.
 *
 * - `none`: the resource opted out of the KB (`skip_embedding`, e.g. Creator
 *   Pack video ZIMs, which are media galleries, not text).
 * - `reconcile_replacement`: a content update replaced a prior file at a
 *   different path and the AI Assistant is up; mirror the old file's indexed
 *   state (RagService.reconcileReplacedContentFile).
 * - `record_and_embed`: policy Always with the AI Assistant up; record the
 *   row and dispatch the embed now.
 * - `record_pending`: everything else; record `pending_decision`. Under
 *   Manual that is the end state (the KB panel offers Index). Under Always
 *   it is picked up by the storage sync that runs when Ollama finishes
 *   installing.
 */
export type DownloadedZimKbAction =
  | 'none'
  | 'reconcile_replacement'
  | 'record_and_embed'
  | 'record_pending'

export interface DownloadedZimKbInput {
  skipEmbedding: boolean
  isReplacement: boolean
  policy: IngestPolicy
  aiInstalled: boolean
}

export function decideDownloadedZimKbAction(input: DownloadedZimKbInput): DownloadedZimKbAction {
  if (input.skipEmbedding) return 'none'
  if (input.isReplacement && input.aiInstalled) return 'reconcile_replacement'
  if (input.policy === 'Always' && input.aiInstalled) return 'record_and_embed'
  return 'record_pending'
}
