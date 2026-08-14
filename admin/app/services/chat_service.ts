import ChatSession from '#models/chat_session'
import ChatMessage from '#models/chat_message'
import KVStore from '#models/kv_store'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import { OllamaService } from './ollama_service.js'
import { SYSTEM_PROMPTS } from '../../constants/ollama.js'
import { pickTasksModel, toTitleCase } from '../utils/misc.js'

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
    let configured: string | null = null
    try {
      configured = await KVStore.getValue('ai.tasksModel')
    } catch (error) {
      logger.error(
        `[ChatService] Failed to read ai.tasksModel: ${error instanceof Error ? error.message : error}`
      )
      return fallback
    }
    if (!configured?.trim()) {
      return fallback
    }

    let models = installed
    if (!models) {
      try {
        models = await this.ollamaService.getModels()
      } catch (error) {
        logger.error(
          `[ChatService] Failed to list models while resolving the tasks model: ${error instanceof Error ? error.message : error}`
        )
        return fallback
      }
    }

    const { model, staleConfigured } = pickTasksModel(
      configured,
      (models ?? []).map((m) => m.name),
      fallback
    )
    if (staleConfigured) {
      logger.warn(
        `[ChatService] Configured tasks model "${staleConfigured}" is not installed; falling back to "${fallback ?? 'none'}"`
      )
    }
    return model
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

      const response = await this.ollamaService.chat({
        model,
        messages: [
          {
            role: 'user',
            content: SYSTEM_PROMPTS.chat_suggestions,
          }
        ],
        stream: false,
      })

      if (response && response.message && response.message.content) {
        const content = response.message.content.trim()
        
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

  async addMessage(sessionId: number, role: 'system' | 'user' | 'assistant', content: string) {
    try {
      const message = await ChatMessage.create({
        session_id: sessionId,
        role,
        content,
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
      let title: string

      // Titles are aesthetic work; route them to the tasks model when one is
      // configured rather than the chat model that just answered.
      const titleModel = (await this.resolveTasksModel(model)) ?? model

      const response = await this.ollamaService.chat({
        model: titleModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.title_generation },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantMessage },
        ],
      })

      title = response?.message?.content?.trim()
      if (!title) {
        title = userMessage.slice(0, 57) + (userMessage.length > 57 ? '...' : '')
      }

      await this.updateSession(sessionId, { title })
      logger.info(`[ChatService] Generated title for session ${sessionId}: "${title}"`)
    } catch (error) {
      logger.error(
        `[ChatService] Failed to generate title for session ${sessionId}: ${error instanceof Error ? error.message : error}`
      )
      // Fall back to truncated user message
      try {
        const fallbackTitle = userMessage.slice(0, 57) + (userMessage.length > 57 ? '...' : '')
        await this.updateSession(sessionId, { title: fallbackTitle })
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
