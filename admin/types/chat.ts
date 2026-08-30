/**
 * A single provenance entry under an assistant answer: the document a chunk of
 * injected context came from. `source` is the originating file/ZIM path and is
 * what dedupes the list; `title` is what the user actually reads.
 */
export interface ChatSource {
  title: string
  date?: string
  source?: string
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  thinking?: string
  isThinking?: boolean
  thinkingDuration?: number
  sources?: ChatSource[]
}

export interface ChatSession {
  id: string
  title: string
  lastMessage?: string
  timestamp: Date
}
