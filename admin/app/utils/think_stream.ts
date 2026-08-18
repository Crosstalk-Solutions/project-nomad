/**
 * Stateful splitter for inline `<think>...</think>` reasoning tags.
 *
 * Ollama's native `/api/chat` and its `/v1` shim both surface reasoning as a
 * dedicated field (`message.thinking` / `delta.reasoning`), but other
 * OpenAI-compatible backends (LM Studio, llama.cpp, plain GGUF servers) emit
 * the tags inline in the content stream. This splits them back out so the UI
 * gets a clean `content` channel and a separate `thinking` channel regardless
 * of which backend answered.
 *
 * Lives here rather than inside OllamaService because both transports need it
 * and because it is the only real logic in the streaming path — as a pure
 * class it can be exercised under bare `node --test` with no Ollama, the same
 * reason `rag_prompt.ts` is shaped this way.
 *
 * The hard part is that a tag can be split across chunk boundaries: a chunk may
 * end with `"<thi"`. Any trailing text that could still turn out to be the start
 * of a tag is held back in the buffer and re-examined when the next chunk lands.
 */

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/**
 * How many trailing characters of `text` could be the beginning of `tag`.
 * Returns 0 when no suffix of `text` is a prefix of `tag`.
 */
export function partialTagSuffix(tag: string, text: string): number {
  for (let len = Math.min(tag.length - 1, text.length); len >= 1; len--) {
    if (text.endsWith(tag.slice(0, len))) return len
  }
  return 0
}

export type ThinkSplit = { content: string; thinking: string }

export class ThinkTagSplitter {
  private buffer = ''
  private inThink = false

  /**
   * Feed the next slice of raw model output. Returns only what could be
   * resolved from this call; text that might be a partial tag stays buffered.
   */
  push(raw: string): ThinkSplit {
    this.buffer += raw
    let content = ''
    let thinking = ''

    while (this.buffer.length > 0) {
      if (this.inThink) {
        const closeIdx = this.buffer.indexOf(CLOSE_TAG)
        if (closeIdx !== -1) {
          thinking += this.buffer.slice(0, closeIdx)
          this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length)
          this.inThink = false
        } else {
          const hold = partialTagSuffix(CLOSE_TAG, this.buffer)
          thinking += this.buffer.slice(0, this.buffer.length - hold)
          this.buffer = this.buffer.slice(this.buffer.length - hold)
          break
        }
      } else {
        const openIdx = this.buffer.indexOf(OPEN_TAG)
        if (openIdx !== -1) {
          content += this.buffer.slice(0, openIdx)
          this.buffer = this.buffer.slice(openIdx + OPEN_TAG.length)
          this.inThink = true
        } else {
          const hold = partialTagSuffix(OPEN_TAG, this.buffer)
          content += this.buffer.slice(0, this.buffer.length - hold)
          this.buffer = this.buffer.slice(this.buffer.length - hold)
          break
        }
      }
    }

    return { content, thinking }
  }

  /**
   * Flush whatever is still buffered at end of stream. A held-back partial tag
   * that never completed was never a tag, so it belongs to whichever channel
   * we were in when the stream ended — losing it would silently truncate the
   * answer.
   */
  flush(): ThinkSplit {
    const pending = this.buffer
    this.buffer = ''
    return this.inThink ? { content: '', thinking: pending } : { content: pending, thinking: '' }
  }
}

/**
 * One-shot convenience for non-streaming responses.
 */
export function splitThinkTags(raw: string): ThinkSplit {
  const splitter = new ThinkTagSplitter()
  const streamed = splitter.push(raw)
  const tail = splitter.flush()
  return {
    content: streamed.content + tail.content,
    thinking: streamed.thinking + tail.thinking,
  }
}
