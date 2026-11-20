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
  images?: ChatImageAttachment[]
  timestamp: Date
  isStreaming?: boolean
  thinking?: string
  isThinking?: boolean
  thinkingDuration?: number
  sources?: ChatSource[]
  // Generation stopped at the length limit, so the answer ends mid-thought.
  truncated?: boolean
  // Shown under the answer when it was not produced the way the user set things
  // up, e.g. by the local stand-in while the remote AI server was unreachable.
  notice?: string
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
  // Answered on this machine only, never by a remote AI server.
  localOnly?: boolean
  lastMessage?: string
  timestamp: Date
}
