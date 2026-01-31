export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
}

export interface ChatSession {
  id: string
  title: string
  lastMessage?: string
  timestamp: Date
}
