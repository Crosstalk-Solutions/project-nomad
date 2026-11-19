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
  // Tool steps of the chat agent behind this answer (see app/services/agent_service.ts).
  steps?: AgentStepView[]
}

export interface AgentStepLink {
  title: string
  url: string
  kind: 'library' | 'file'
}

export interface AgentStepView {
  id: string
  round: number
  tool: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  summary?: string
  links?: AgentStepLink[]
  note?: string
  ms?: number
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
