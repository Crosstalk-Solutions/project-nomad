export type NomadOllamaModel = {
  id: string
  name: string
  description: string
  estimated_pulls: string
  model_last_updated: string
  first_seen: string
  tags: NomadOllamaModelTag[]
}

export type NomadOllamaModelTag = {
  name: string
  size: string
  context: string
  input: string
  cloud: boolean
  thinking: boolean
}

export type NomadOllamaModelAPIResponse = {
  success: boolean
  message: string
  models: NomadOllamaModel[]
}

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type OllamaChatRequest = {
  model: string
  messages: OllamaChatMessage[]
  stream?: boolean
  sessionId?: number
  // Effective thinking preference for this request (per-model override or global default).
  think?: boolean
  collection?: string
}

export type OllamaChatResponse = {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
}

export type NomadInstalledModel = {
  name: string
  size: number
  digest?: string
  details?: Record<string, any>
  // Whether the model supports "thinking" (set by the installed-models endpoint enrichment).
  thinking?: boolean
}

export type NomadChatResponse = {
  message: { content: string; thinking?: string }
  done: boolean
  model: string
}
