export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  thinking?: string
  isThinking?: boolean
  thinkingDuration?: number
}

export interface ChatSession {
  id: string
  title: string
  lastMessage?: string
  timestamp: Date
}

export type { PersonaKey } from '../constants/ollama.js'
import type { PersonaKey } from '../constants/ollama.js'

export interface PersonaSummary {
  key: PersonaKey
  label: string
  description: string
}
