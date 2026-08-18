/**
 * Decides what actually goes into the prompt, and what gets left out.
 *
 * Before this existed, nothing trimmed anything: the browser posted the whole
 * session, the pipeline copied it verbatim, and overflow was left to the
 * backend. That is the worst possible arrangement, because backend truncation is
 * *silent* and *positional* — llama.cpp drops from the middle of the window, so
 * what gets discarded is conversation history and retrieved knowledge-base
 * context, while the model gives no indication anything is missing. Measured on
 * a live Ollama, a 7,000-token prompt came back having processed 2,060 tokens,
 * and the model confabulated an answer from the fragment that survived.
 *
 * So the rule here is: never hand the backend more than it can hold. Decide
 * explicitly what to drop, drop it in a way the model can reason about, and
 * record what happened so the eval harness can see it.
 *
 * Allocation order, most protected first:
 *   1. Response reserve  — tokens held back for the answer itself.
 *   2. Fixed blocks      — system prompts and the current question. Never dropped.
 *   3. Retrieved context — whole chunks, best-first, until its share is spent.
 *   4. History           — whole turns, newest-first, into whatever remains.
 *
 * Pure and dependency-free so it runs under bare `node --test`, the same
 * convention as `rag_prompt.ts`.
 */

import { estimateMessagesTokens, estimateTokens } from './token_estimate.js'

export type BudgetRole = 'system' | 'user' | 'assistant'
export type BudgetMessage = { role: BudgetRole; content: string }

/** A retrieved chunk, already ranked — index 0 is the best match. */
export type BudgetChunk = { text: string; metadata?: Record<string, any> }

/**
 * Where the per-turn retrieved-context block goes.
 *
 * `tail` places it immediately before the current question, leaving
 * [system][history] as a byte-identical prefix across turns so the backend can
 * reuse its KV cache. `front` is the historical behaviour: a system message
 * ahead of all history, which changes content every turn and therefore
 * invalidates the cached prefix for the entire conversation behind it.
 *
 * The common advice to "inject RAG into the system prompt" assumes the context
 * is fixed for the session (an attached document), where a fixed position does
 * preserve the prefix. When context is re-retrieved every turn, the opposite is
 * true. Both are kept so `eval:generation` can measure the difference rather
 * than the choice resting on argument alone.
 */
export type RagPlacement = 'tail' | 'front'

export type BudgetInputs = {
  /** Stable system blocks (NOMAD.md, formatting rules), in final order. */
  systemBlocks: BudgetMessage[]
  /** Prior conversation, oldest first, excluding the current question. */
  history: BudgetMessage[]
  /** The current user message. Never dropped. */
  query: BudgetMessage
  /** Retrieved chunks, best first. May be empty. */
  ragChunks: BudgetChunk[]
  /** Renders surviving chunks into the final context message. */
  renderRagBlock: (chunks: BudgetChunk[]) => string
  /** The resolved context window, in tokens. */
  contextWindow: number
  /** Learned per-model token-estimator correction. */
  ratio?: number
  ragPlacement?: RagPlacement
  /** Overrides for the response reserve and RAG share; mostly for tests. */
  responseReserve?: number
  ragShare?: number
}

export type BudgetTrace = {
  contextWindow: number
  responseReserve: number
  promptBudget: number
  estimatedPromptTokens: number
  systemTokens: number
  queryTokens: number
  ragTokens: number
  historyTokens: number
  chunksKept: number
  chunksDropped: number
  turnsKept: number
  turnsDropped: number
  historyElided: boolean
  queryTruncated: boolean
  ragPlacement: RagPlacement
}

export type BudgetResult = {
  messages: BudgetMessage[]
  trace: BudgetTrace
  /** What to send as num_predict, so generation can't run past the window. */
  numPredict: number
}

/** Ceiling on tokens reserved for the answer. */
export const MAX_RESPONSE_RESERVE = 1024
/** Share of the window reserved for the answer when that is smaller. */
export const RESPONSE_RESERVE_FRACTION = 0.25
/** Share of the remaining budget the retrieved context may claim. */
export const DEFAULT_RAG_SHARE = 0.35

/**
 * Marker inserted where turns were dropped.
 *
 * Worth the handful of tokens: without it the model sees a conversation that
 * appears to begin mid-thought and has no way to tell that it is missing
 * context, which is exactly when small models start confidently inventing what
 * "we discussed earlier".
 */
export const ELISION_MARKER =
  '[Earlier messages in this conversation have been omitted to fit the context window.]'

/**
 * Turns are dropped in blocks rather than one at a time.
 *
 * Dropping a single turn per request would shift the prompt prefix on *every*
 * subsequent turn, invalidating the backend's KV cache each time — trading a
 * small saving in tokens for a full re-prefill. Dropping several at once means
 * the prefix then stays stable for several turns.
 */
export const HISTORY_EVICTION_BLOCK = 4

/**
 * Group a flat message list into whole turns.
 *
 * A turn is a user message plus everything that answers it. Truncating on a
 * message boundary instead can leave the transcript starting with an assistant
 * reply to a question the model can no longer see — which reads, to the model,
 * as though it said something unprompted.
 */
export function groupIntoTurns(history: BudgetMessage[]): BudgetMessage[][] {
  const turns: BudgetMessage[][] = []
  for (const message of history) {
    if (message.role === 'user' || turns.length === 0) {
      turns.push([message])
    } else {
      turns[turns.length - 1].push(message)
    }
  }
  return turns
}

/**
 * Plan the prompt.
 *
 * Never returns a message array estimated to exceed `contextWindow -
 * responseReserve`, except in the degenerate case where the fixed blocks alone
 * are too large — and in that case the query is truncated visibly rather than
 * being handed to the backend to cut silently.
 */
export function planPrompt(inputs: BudgetInputs): BudgetResult {
  const ratio = inputs.ratio ?? 1
  const placement = inputs.ragPlacement ?? 'tail'
  const contextWindow = inputs.contextWindow

  const responseReserve =
    inputs.responseReserve ??
    Math.max(256, Math.min(MAX_RESPONSE_RESERVE, Math.floor(contextWindow * RESPONSE_RESERVE_FRACTION)))
  const promptBudget = Math.max(0, contextWindow - responseReserve)

  const cost = (messages: BudgetMessage[]) => estimateMessagesTokens(messages, ratio)

  // --- Fixed blocks: system prompts and the question --------------------
  const systemTokens = cost(inputs.systemBlocks)
  let query = inputs.query
  let queryTokens = cost([query])
  let queryTruncated = false

  // Degenerate case: the system prompts plus the question alone overflow the
  // window. Truncating here is a bad outcome, but it is a *visible* one — the
  // alternative is the backend silently cutting the question in half.
  if (systemTokens + queryTokens > promptBudget) {
    const available = Math.max(0, promptBudget - systemTokens)
    if (available > 0) {
      const perToken = query.content.length / Math.max(1, estimateTokens(query.content, ratio))
      const keepChars = Math.max(0, Math.floor(available * perToken) - ELISION_MARKER.length)
      query = {
        ...query,
        content:
          query.content.slice(0, keepChars) +
          '\n\n[This message was truncated because it exceeds the context window.]',
      }
      queryTokens = cost([query])
      queryTruncated = true
    }
  }

  let remaining = promptBudget - systemTokens - queryTokens

  // --- Retrieved context: whole chunks, best first ----------------------
  //
  // Whole chunks, deliberately. The previous behaviour capped on a running
  // character count, which could hand the model a chunk cut off mid-sentence —
  // the worst of both worlds, since it costs tokens without carrying a complete
  // fact. A chunk that doesn't fit is dropped, not shortened.
  const ragBudget = Math.max(0, Math.floor(Math.max(0, remaining) * (inputs.ragShare ?? DEFAULT_RAG_SHARE)))
  const keptChunks: BudgetChunk[] = []
  let ragTokens = 0

  if (inputs.ragChunks.length > 0 && ragBudget > 0) {
    for (const chunk of inputs.ragChunks) {
      const candidate = [...keptChunks, chunk]
      const rendered = inputs.renderRagBlock(candidate)
      const candidateTokens = cost([{ role: 'system', content: rendered }])
      if (candidateTokens <= ragBudget) {
        keptChunks.push(chunk)
        ragTokens = candidateTokens
      }
      // Keep scanning: a later, smaller chunk may still fit where this one didn't.
    }
  }

  const ragMessage: BudgetMessage | null =
    keptChunks.length > 0
      ? { role: 'system', content: inputs.renderRagBlock(keptChunks) }
      : null

  remaining -= ragTokens

  // --- History: whole turns, newest first -------------------------------
  const turns = groupIntoTurns(inputs.history)
  const keptTurns: BudgetMessage[][] = []
  let historyTokens = 0

  for (let i = turns.length - 1; i >= 0; i--) {
    const turnTokens = cost(turns[i])
    if (historyTokens + turnTokens > remaining) break
    keptTurns.unshift(turns[i])
    historyTokens += turnTokens
  }

  const turnsDropped = turns.length - keptTurns.length

  // Chunky eviction: once we're dropping anything, drop a whole block, so the
  // surviving prefix stays put for the next several turns instead of shifting
  // on every request and forcing a re-prefill each time.
  if (turnsDropped > 0 && keptTurns.length > 0) {
    const overshoot = turnsDropped % HISTORY_EVICTION_BLOCK
    const extra = overshoot === 0 ? 0 : HISTORY_EVICTION_BLOCK - overshoot
    for (let i = 0; i < extra && keptTurns.length > 1; i++) {
      const removed = keptTurns.shift()!
      historyTokens -= cost(removed)
    }
  }

  const historyElided = keptTurns.length < turns.length
  const historyMessages = keptTurns.flat()

  // --- Assemble, stability-descending -----------------------------------
  const messages: BudgetMessage[] = []
  messages.push(...inputs.systemBlocks)
  if (historyElided) {
    messages.push({ role: 'system', content: ELISION_MARKER })
  }

  if (placement === 'front' && ragMessage) {
    // Historical ordering, kept only so the two can be compared under eval.
    messages.splice(inputs.systemBlocks.length, 0, ragMessage)
    messages.push(...historyMessages)
  } else {
    messages.push(...historyMessages)
    if (ragMessage) messages.push(ragMessage)
  }
  messages.push(query)

  const estimatedPromptTokens = cost(messages)

  return {
    messages,
    numPredict: responseReserve,
    trace: {
      contextWindow,
      responseReserve,
      promptBudget,
      estimatedPromptTokens,
      systemTokens,
      queryTokens,
      ragTokens,
      historyTokens,
      chunksKept: keptChunks.length,
      chunksDropped: inputs.ragChunks.length - keptChunks.length,
      turnsKept: keptTurns.length,
      turnsDropped: turns.length - keptTurns.length,
      historyElided,
      queryTruncated,
      ragPlacement: placement,
    },
  }
}
