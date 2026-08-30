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
