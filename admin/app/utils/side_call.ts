/**
 * Load options for an ancillary call (query rewrite, relevance check, title,
 * suggestions) so it does not make Ollama reload the chat model.
 *
 * With `ai.tasksModel` unset those calls run on the chat model itself. Sent
 * without num_ctx and keep_alive, Ollama loads that model at its default
 * context, then the real chat request reloads it at the planned one: two
 * reloads and a lost KV cache every turn. When the side model *is* the chat
 * model, it has to ask for exactly what the chat asks for. A different model
 * gets nothing, as before.
 *
 * Pure so it runs under bare `node --test`.
 */
export type SideCallResidency = { numCtx?: number; keepAlive?: string | number }

export function sideCallResidency(
  sideModel: string,
  chatModel: string | null | undefined,
  chat: SideCallResidency
): SideCallResidency {
  if (!chatModel || sideModel !== chatModel) return {}
  return {
    ...(chat.numCtx !== undefined ? { numCtx: chat.numCtx } : {}),
    ...(chat.keepAlive !== undefined ? { keepAlive: chat.keepAlive } : {}),
  }
}
