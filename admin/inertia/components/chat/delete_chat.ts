/**
 * Decisions for deleting one saved chat from the sidebar.
 *
 * The outlined flame asks for confirmation. Cancel and a failed request leave
 * the open conversation and the saved-chat list alone. Success removes only
 * the confirmed id. Deleting the chat on screen returns to a clean new chat
 * (no session yet). Deleting any other chat leaves the open one in place.
 */

export const DELETE_CHAT_LABEL = 'Delete chat'
export const DELETE_CHAT_CONFIRM_TEXT = 'Delete chat'
export const DELETE_CHAT_CANCEL_TEXT = 'Cancel'
export const DELETE_CHAT_FAILURE_MESSAGE = 'This chat could not be deleted. Nothing was removed.'

/**
 * Trailing controls after the chat title, left to right.
 * Individual delete is the outlined flame. This release's sidebar rows have no
 * per-chat ellipsis menu; a menu added later stays after the flame.
 */
export const CHAT_ROW_TRAILING_CONTROLS = ['delete-chat'] as const

export type ChatRowTrailingControl = (typeof CHAT_ROW_TRAILING_CONTROLS)[number]

export interface SavedChatRef {
  id: string
  title: string
}

export interface ChatViewSnapshot<TMessage> {
  activeSessionId: string | null
  messages: TMessage[]
}

export interface DeleteChatConfirmation {
  sessionId: string
  title: string
}

export interface DeleteChatState<TSession extends { id: string }, TMessage> {
  sessions: TSession[]
  view: ChatViewSnapshot<TMessage>
}

export function openDeleteConfirmation(chat: SavedChatRef): DeleteChatConfirmation {
  return { sessionId: chat.id, title: chat.title }
}

export function cancelDeleteConfirmation(): null {
  return null
}

export function canSubmitDelete(
  confirmation: DeleteChatConfirmation | null,
  inFlight: boolean
): confirmation is DeleteChatConfirmation {
  return confirmation !== null && !inFlight
}

/** The request body is the one confirmed session id. */
export function deletionRequest(confirmation: DeleteChatConfirmation): { sessionId: string } {
  return { sessionId: confirmation.sessionId }
}

export function deleteRequestSucceeded(result: { success?: boolean } | null | undefined): boolean {
  return result?.success === true
}

export function applyDeleteOutcome<TSession extends { id: string }, TMessage>(
  state: DeleteChatState<TSession, TMessage>,
  sessionId: string,
  outcome: 'success' | 'failure'
): DeleteChatState<TSession, TMessage> {
  if (outcome === 'failure') return state

  const sessions = state.sessions.filter((session) => session.id !== sessionId)
  if (state.view.activeSessionId !== sessionId) {
    return { sessions, view: state.view }
  }

  return {
    sessions,
    view: { activeSessionId: null, messages: [] },
  }
}
