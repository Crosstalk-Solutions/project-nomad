/**
 * Scope for deleting one saved chat.
 *
 * The existing `DELETE /api/chat/sessions/:id` route is the only deletion entry
 * point. Messages hang off that session (`chat_messages.session_id`) and the
 * table already declares ON DELETE CASCADE. The service also deletes those
 * messages explicitly so a chat cannot leave its messages behind when the
 * database does not enforce the foreign key. Knowledge-base tables are not
 * part of this scope.
 */
export const CHAT_DELETION_TABLES = ['chat_messages', 'chat_sessions'] as const

export interface ChatDeletionScope {
  sessionId: number
  /** Messages are selected only by this session id. */
  messageSessionId: number
  tables: typeof CHAT_DELETION_TABLES
}

export function parseChatSessionId(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw <= 0) return null
    return raw
  }

  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return null

  const id = Number(raw)
  if (!Number.isSafeInteger(id)) return null
  return id
}

export function chatDeletionScope(sessionId: number): ChatDeletionScope {
  const id = parseChatSessionId(sessionId)
  if (id === null) {
    throw new Error('Invalid chat session id')
  }

  return {
    sessionId: id,
    messageSessionId: id,
    tables: CHAT_DELETION_TABLES,
  }
}
