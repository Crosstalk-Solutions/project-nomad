import ChatSession from '#models/chat_session'
import ChatMessage from '#models/chat_message'
import KVStore from '#models/kv_store'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import { OllamaService } from './ollama_service.js'
import { SYSTEM_PROMPTS } from '../../constants/ollama.js'
import { toTitleCase } from '../utils/misc.js'
import { resolveTasksModel } from '../utils/tasks_model.js'
import {
  SUGGESTIONS_SCHEMA,
  TITLE_SCHEMA,
  pickSuggestions,
  pickTitle,
  resolveStructured,
} from '../utils/structured_output.js'
import type { ChatSource } from '../../types/chat.js'

/** Sidebar width, near enough. Applied once, to whichever candidate title won. */
const TITLE_MAX_LENGTH = 57

function truncateTitle(value: string): string {
  return value.length > TITLE_MAX_LENGTH ? value.slice(0, TITLE_MAX_LENGTH) + '...' : value
}

@inject()
export class ChatService {
  constructor(private ollamaService: OllamaService) {}

  /**
   * The model to use for ancillary work — chat titles and chat suggestions.
   *
   * Prefers the user's `ai.tasksModel` setting so a 30B reasoning model isn't
   * spending seconds "thinking" to produce a three-word sidebar title. Falls
   * back to `fallback` when the setting is unset (the default, which preserves
   * the previous behaviour) or when the configured model is no longer
   * installed. `installed` is passed in by callers that already listed models,
   * to avoid a second round-trip.
   */
  private async resolveTasksModel(
    fallback: string | null,
    installed?: { name: string }[]
  ): Promise<string | null> {
    return resolveTasksModel(this.ollamaService, fallback, installed, '[ChatService]')
  }

  async getAllSessions() {
    try {
      const sessions = await ChatSession.query().orderBy('updated_at', 'desc')
      return sessions.map((session) => ({
        id: session.id.toString(),
        title: session.title,
        model: session.model,
        timestamp: session.updated_at.toJSDate(),
        lastMessage: null, // Will be populated from messages if needed
      }))
    } catch (error) {
      logger.error(
        `[ChatService] Failed to get sessions: ${error instanceof Error ? error.message : error}`
      )
      return []
    }
  }

  async getChatSuggestions() {
    try {
      const models = await this.ollamaService.getModels()
      if (!models || models.length === 0) {
        return [] // If no models are available, return empty suggestions
      }

      // The user's dedicated tasks model wins when set — suggestions are short
      // aesthetic prompts that don't benefit from a flagship model. Otherwise
      // prefer the user's selected chat model, and fall back to the smallest
      // installed model — picking the largest by file size is unsafe: if any
      // installed model exceeds available VRAM (e.g. llama3.1:405b on a 96 GB
      // GPU), Ollama spends minutes trying to load it and the request 500s.
      const lastModel = await KVStore.getValue('chat.lastModel')
      const preferred = lastModel ? models.find((m) => m.name === lastModel) : undefined
      const chosen =
        preferred ??
        models.reduce((prev, current) => (prev.size < current.size ? prev : current))

      if (!chosen) {
        return []
      }

      const model = (await this.resolveTasksModel(chosen.name, models)) ?? chosen.name

      // Suggestions are a formatting task, not a reasoning one. A reasoning tasks model
      // would spend the whole response thinking and leave nothing to parse, so suppress
      // it at the source; `thinkingCapable` is what lets the compat transport pick
      // reasoning_effort:'none' rather than sending nothing. Memoized per model name.
      const thinkingCapable = await this.ollamaService.checkModelHasThinking(model)

      const response = await this.ollamaService.chat({
        model,
        messages: [
          {
            role: 'user',
            content: SYSTEM_PROMPTS.chat_suggestions,
          }
        ],
        stream: false,
        think: false,
        thinkingCapable,
        // Grammar-constrained on the native transport, so the response is three
        // strings in an array rather than whatever prose the model felt like.
        format: SUGGESTIONS_SCHEMA,
        // The default of 0.8 is actively hostile to format stability, and there is
        // nothing creative about picking three canned opening questions.
        temperature: 0,
      })

      if (response && response.message && response.message.content) {
        const content = response.message.content.trim()

        const structured = resolveStructured(content, pickSuggestions, response.structured === true)
        if (structured.ok) {
          return structured.value.map((s) => toTitleCase(s))
        }
        if (structured.reason === 'constrained-parse-failed') {
          // The grammar was applied and the model broke it anyway, so what came back
          // is a broken JSON object rather than prose. Splitting that on commas would
          // surface `{"suggestions": ["How Do I` as a chip. No chips is the better
          // failure — they are decorative, and the empty state is already designed.
          logger.warn(
            `[ChatService] Model "${model}" broke the suggestion grammar; returning no suggestions`
          )
          return []
        }
        logger.warn(
          `[ChatService] Model "${model}" returned no suggestion JSON; falling back to text parsing`
        )

        // Handle both comma-separated and newline-separated formats
        let suggestions: string[] = []
        
        // Try splitting by commas first
        if (content.includes(',')) {
          suggestions = content.split(',').map((s) => s.trim())
        } 
        // Fall back to newline separation
        else {
          suggestions = content
            .split(/\r?\n/)
            .map((s) => s.trim())
            // Remove numbered list markers (1., 2., 3., etc.) and bullet points
            .map((s) => s.replace(/^\d+\.\s*/, '').replace(/^[-*•]\s*/, ''))
            // Remove surrounding quotes if present
            .map((s) => s.replace(/^["']|["']$/g, ''))
        }
        
        // Filter out empty strings and limit to 3 suggestions
        const filtered =  suggestions
          .filter((s) => s.length > 0)
          .slice(0, 3)

        return filtered.map((s) => toTitleCase(s))
      } else {
        // Empty content after the <think> split means the model produced reasoning and
        // nothing else. Log it rather than silently returning no chips.
        logger.warn(`[ChatService] Model "${model}" returned no usable suggestion text`)
        return []
      }
    } catch (error) {
      logger.error(
        `[ChatService] Failed to get chat suggestions: ${
          error instanceof Error ? error.message : error
        }`
      )
      return []
    }
  }

  async getSession(sessionId: number) {
    try {
      const session = await ChatSession.query().where('id', sessionId).preload('messages').first()

      if (!session) {
        return null
      }

      return {
        id: session.id.toString(),
        title: session.title,
        model: session.model,
        timestamp: session.updated_at.toJSDate(),
        messages: session.messages.map((msg) => ({
          id: msg.id.toString(),
          role: msg.role,
          content: msg.content,
          timestamp: msg.created_at.toJSDate(),
          sources: msg.sources ? JSON.parse(msg.sources) : undefined,
        })),
      }
    } catch (error) {
      logger.error(
        `[ChatService] Failed to get session ${sessionId}: ${
          error instanceof Error ? error.message : error
        }`
      )
      return null
    }
  }

  async createSession(title: string, model?: string) {
    try {
      const session = await ChatSession.create({
        title,
        model: model || null,
      })

      return {
        id: session.id.toString(),
        title: session.title,
        model: session.model,
        timestamp: session.created_at.toJSDate(),
      }
    } catch (error) {
      logger.error(
        `[ChatService] Failed to create session: ${error instanceof Error ? error.message : error}`
      )
      throw new Error('Failed to create chat session')
    }
  }

  async updateSession(sessionId: number, data: { title?: string; model?: string }) {
    try {
      const session = await ChatSession.findOrFail(sessionId)

      if (data.title) {
        session.title = data.title
      }
      if (data.model !== undefined) {
        session.model = data.model
      }

      await session.save()

      return {
        id: session.id.toString(),
        title: session.title,
        model: session.model,
        timestamp: session.updated_at.toJSDate(),
      }
    } catch (error) {
      logger.error(
        `[ChatService] Failed to update session ${sessionId}: ${
          error instanceof Error ? error.message : error
        }`
      )
      throw new Error('Failed to update chat session')
    }
  }

  async addMessage(
    sessionId: number,
    role: 'system' | 'user' | 'assistant',
    content: string,
    sources?: ChatSource[]
  ) {
    try {
      const message = await ChatMessage.create({
        session_id: sessionId,
        role,
        content,
        sources: sources && sources.length > 0 ? JSON.stringify(sources) : null,
      })

      // Update session's updated_at timestamp
      const session = await ChatSession.findOrFail(sessionId)
      session.updated_at = DateTime.now()
      await session.save()

      return {
        id: message.id.toString(),
        role: message.role,
        content: message.content,
        timestamp: message.created_at.toJSDate(),
        sources: sources && sources.length > 0 ? sources : undefined,
      }
    } catch (error) {
      logger.error(
        `[ChatService] Failed to add message to session ${sessionId}: ${
          error instanceof Error ? error.message : error
        }`
      )
      throw new Error('Failed to add message')
    }
  }

  async deleteSession(sessionId: number) {
    try {
      const session = await ChatSession.findOrFail(sessionId)
      await session.delete()
      return { success: true }
    } catch (error) {
      logger.error(
        `[ChatService] Failed to delete session ${sessionId}: ${
          error instanceof Error ? error.message : error
        }`
      )
      throw new Error('Failed to delete chat session')
    }
  }

  async getMessageCount(sessionId: number): Promise<number> {
    try {
      const count = await ChatMessage.query().where('session_id', sessionId).count('* as total')
      return Number(count[0].$extras.total)
    } catch (error) {
      logger.error(
        `[ChatService] Failed to get message count for session ${sessionId}: ${error instanceof Error ? error.message : error}`
      )
      return 0
    }
  }

  async generateTitle(sessionId: number, userMessage: string, assistantMessage: string, model: string) {
    try {
      // Titles are aesthetic work; route them to the tasks model when one is
      // configured rather than the chat model that just answered.
      const titleModel = (await this.resolveTasksModel(model)) ?? model

      // Naming a chat needs no reasoning; see the note in getChatSuggestions.
      const thinkingCapable = await this.ollamaService.checkModelHasThinking(titleModel)

      const response = await this.ollamaService.chat({
        model: titleModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.title_generation },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantMessage },
        ],
        think: false,
        thinkingCapable,
        format: TITLE_SCHEMA,
        // See the note on suggestions: naming a chat is not a creative task, and
        // the backend default of 0.8 makes the format wobble.
        temperature: 0,
      })

      const content = response?.message?.content?.trim() ?? ''
      const structured = resolveStructured(content, pickTitle, response?.structured === true)

      let title: string
      if (!content) {
        // Nothing left once reasoning was split out. Checked before the grammar branch
        // so the log says what actually happened rather than blaming the schema.
        logger.warn(
          `[ChatService] Model "${titleModel}" returned no usable title text; using the user message`
        )
        title = userMessage
      } else if (structured.ok) {
        title = structured.value
      } else if (structured.reason === 'constrained-parse-failed') {
        // A truncated object would otherwise be stored verbatim, leaving `{"title": ...`
        // in the sidebar. The user's own words are a worse title than the model's but a
        // far better one than a JSON fragment.
        logger.warn(
          `[ChatService] Model "${titleModel}" broke the title grammar; using the user message`
        )
        title = userMessage
      } else {
        // Unconstrained backend: the response is meant to be the bare title.
        title = content
      }

      if (!title) {
        // An unconstrained response that was pure punctuation or whitespace.
        logger.warn(
          `[ChatService] Model "${titleModel}" returned no usable title text; using the user message`
        )
        title = userMessage
      }

      // Applied once, to whichever string won: "under 50 characters" is a request the
      // model can ignore on the schema path and the text path alike.
      title = truncateTitle(title)

      await this.updateSession(sessionId, { title })
      logger.info(`[ChatService] Generated title for session ${sessionId}: "${title}"`)
    } catch (error) {
      logger.error(
        `[ChatService] Failed to generate title for session ${sessionId}: ${error instanceof Error ? error.message : error}`
      )
      // Fall back to truncated user message
      try {
        await this.updateSession(sessionId, { title: truncateTitle(userMessage) })
      } catch {
        // Silently fail - session keeps "New Chat" title
      }
    }
  }

  async deleteAllSessions() {
    try {
      await ChatSession.query().delete()
      return { success: true, message: 'All chat sessions deleted' }
    } catch (error) {
      logger.error(
        `[ChatService] Failed to delete all sessions: ${
          error instanceof Error ? error.message : error
        }`
      )
      throw new Error('Failed to delete all chat sessions')
    }
  }
}
