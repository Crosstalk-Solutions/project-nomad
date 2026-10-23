/**
 * A single provenance entry under an assistant answer: the document a chunk of
 * injected context came from. `source` is the originating file/ZIM path and is
 * what dedupes the list; `title` is what the user actually reads.
 */
export interface ChatSource {
  title: string
  date?: string
  source?: string
  /**
   * The individual articles the model was given from this source, in the order
   * they were injected. Only ZIM chunks carry an `article_path`, so uploads have
   * none. The UI turns each into a link that opens the article in Kiwix.
   */
  articles?: ChatSourceArticle[]
}

export interface ChatSourceArticle {
  title: string
  /** Path of the article inside its ZIM archive (Kiwix `/content/<book>/<path>`). */
  path: string
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: ChatImageAttachment[]
  timestamp: Date
  isStreaming?: boolean
  thinking?: string
  isThinking?: boolean
  thinkingDuration?: number
  sources?: ChatSource[]
  // Generation stopped at the length limit, so the answer ends mid-thought.
  truncated?: boolean
}

export interface ChatImageAttachment {
  id: string
  name: string
  file: File
  previewUrl: string
}

export interface ChatSession {
  id: string
  title: string
  lastMessage?: string
  timestamp: Date
}
