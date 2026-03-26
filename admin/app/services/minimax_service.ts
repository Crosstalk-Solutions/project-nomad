import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

const MINIMAX_BASE_URL = 'https://api.minimax.io/v1'

export const MINIMAX_MODELS = [
  { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7' },
  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7-highspeed' },
] as const

/**
 * Service for interacting with MiniMax cloud LLM API.
 *
 * MiniMax provides an OpenAI-compatible chat completions API, so this service
 * uses native fetch to call it. When MINIMAX_API_KEY is set, cloud models
 * appear alongside local Ollama models in the model selector, giving users
 * an optional cloud-based alternative when internet is available.
 */
export class MiniMaxService {
  private apiKey: string | undefined

  constructor() {
    this.apiKey = env.get('MINIMAX_API_KEY')
  }

  /**
   * Whether MiniMax cloud models are available (API key is configured).
   */
  isAvailable(): boolean {
    return !!this.apiKey
  }

  /**
   * Whether the given model name is a MiniMax model.
   */
  isMiniMaxModel(model: string): boolean {
    return model.startsWith('MiniMax-')
  }

  /**
   * Returns MiniMax models in Ollama ModelResponse-compatible format
   * so they can be mixed into the installed models list.
   */
  getModels() {
    if (!this.isAvailable()) return []

    return MINIMAX_MODELS.map((m) => ({
      name: m.id,
      model: m.id,
      modified_at: new Date(),
      size: 0,
      digest: 'cloud',
      details: {
        parent_model: '',
        format: 'cloud',
        family: 'minimax',
        families: ['minimax'],
        parameter_size: 'cloud',
        quantization_level: '',
      },
    }))
  }

  /**
   * Sends a non-streaming chat request to MiniMax API (OpenAI-compatible).
   * Returns an Ollama-compatible response shape so the controller can use it
   * transparently.
   */
  async chat(params: { model: string; messages: Array<{ role: string; content: string }> }) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY is not configured')
    }

    logger.debug(`[MiniMaxService] Sending chat request to model: ${params.model}`)

    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: 1.0,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      logger.error(`[MiniMaxService] API error ${response.status}: ${errorText}`)
      throw new Error(`MiniMax API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    return {
      model: params.model,
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant' as const,
        content: data.choices[0].message.content,
      },
      done: true,
    }
  }

  /**
   * Sends a streaming chat request to MiniMax API. Returns an async generator
   * that yields Ollama-compatible chunk objects so the controller SSE logic
   * can forward them as-is.
   */
  async *chatStream(params: {
    model: string
    messages: Array<{ role: string; content: string }>
  }) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY is not configured')
    }

    logger.debug(`[MiniMaxService] Starting streaming chat for model: ${params.model}`)

    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: 1.0,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      logger.error(`[MiniMaxService] Streaming API error ${response.status}: ${errorText}`)
      throw new Error(`MiniMax API error: ${response.status} - ${errorText}`)
    }

    if (!response.body) {
      throw new Error('MiniMax API returned no response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const jsonStr = line.slice(5).trim()
          if (!jsonStr || jsonStr === '[DONE]') continue

          try {
            const data = JSON.parse(jsonStr)
            const content = data.choices?.[0]?.delta?.content || ''
            const finishReason = data.choices?.[0]?.finish_reason

            yield {
              model: params.model,
              created_at: new Date().toISOString(),
              message: {
                role: 'assistant' as const,
                content,
              },
              done: finishReason === 'stop',
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
