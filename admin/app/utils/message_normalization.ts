/**
 * Normalise a chat message array for strict OpenAI-compatible backends.
 *
 * The pipeline (`context_budget.ts`) emits several `system` messages: the
 * stable blocks up front and, with the default `tail` placement, the per-turn
 * RAG block *after* the history. Ollama's native `/api/chat` accepts that, but
 * the Jinja template baked into Qwen-family GGUFs requires exactly one system
 * message, and it first — anything else aborts the request with
 * "System message must be at the beginning".
 *
 * Fix: collapse the leading system run into one message at index 0, and
 * relocate any system message after the history (the RAG block) into the last
 * user message. No-op when the array is already well-formed, so ancillary
 * prompts (query rewrite, relevance judge, titles) pass through unchanged.
 *
 * Pure and dependency-free — runs under bare `node --test`, the same
 * convention as `context_budget.ts`.
 */

import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions.js'

/** Read the plain text out of a message body of any shape. */
function contentToText(content: unknown): string {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as ChatCompletionContentPart[])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
  }
  return ''
}

/** Prepend relocated context to a user message, preserving multimodal parts. */
function mergeContextIntoUserMessage(
  message: ChatCompletionMessageParam,
  context: string
): ChatCompletionMessageParam {
  if (message.role !== 'user') return message

  const content = message.content
  if (content === null || content === undefined || typeof content === 'string') {
    return { role: 'user', content: `${context}\n\n${content ?? ''}` }
  }

  // Multimodal: keep every part, but fold the context into the first text part.
  const parts: ChatCompletionContentPart[] = [...content]
  const firstTextIndex = parts.findIndex((part) => part.type === 'text')
  if (firstTextIndex >= 0) {
    const part = parts[firstTextIndex] as Extract<ChatCompletionContentPart, { type: 'text' }>
    parts[firstTextIndex] = { type: 'text', text: `${context}\n\n${part.text}` }
  } else {
    parts.unshift({ type: 'text', text: context })
  }
  return { role: 'user', content: parts }
}

/**
 * Return a message array that satisfies the Qwen-family Jinja invariant: at
 * most one `system` message, and it first. See the module doc for the shape
 * the pipeline emits and why this is only needed on the OpenAI-compat path.
 */
export function normalizeOpenAiMessages(
  messages: ChatCompletionMessageParam[]
): ChatCompletionMessageParam[] {
  const leadingSystem: ChatCompletionMessageParam[] = []
  const nonSystem: ChatCompletionMessageParam[] = []
  const trailingSystem: ChatCompletionMessageParam[] = []

  let seenNonSystem = false
  for (const message of messages) {
    if (message.role === 'system') {
      if (seenNonSystem) trailingSystem.push(message)
      else leadingSystem.push(message)
    } else {
      seenNonSystem = true
      nonSystem.push(message)
    }
  }

  // Already well-formed: nothing to do. Returning the input keeps reference
  // identity for the common path and leaves well-formed prompts byte-identical.
  if (leadingSystem.length <= 1 && trailingSystem.length === 0) {
    return messages
  }

  const out: ChatCompletionMessageParam[] = []

  if (leadingSystem.length === 1) {
    out.push(leadingSystem[0])
  } else if (leadingSystem.length > 1) {
    out.push({
      role: 'system',
      content: leadingSystem.map((m) => contentToText(m.content)).join('\n\n'),
    })
  }

  const context = trailingSystem.map((m) => contentToText(m.content)).join('\n\n')
  if (context) {
    let lastUserIndex = -1
    for (let i = nonSystem.length - 1; i >= 0; i--) {
      if (nonSystem[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex >= 0) {
      nonSystem[lastUserIndex] = mergeContextIntoUserMessage(nonSystem[lastUserIndex], context)
    } else {
      // No user message to carry the context; keep it visible rather than drop it.
      nonSystem.push({ role: 'user', content: context })
    }
  }

  out.push(...nonSystem)
  return out
}
