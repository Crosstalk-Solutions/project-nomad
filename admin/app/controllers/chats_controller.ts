import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ChatService } from '#services/chat_service'
import { createSessionSchema, updateSessionSchema, addMessageSchema } from '#validators/chat'
import KVStore from '#models/kv_store'
import { SystemService } from '#services/system_service'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { apiSuccess, apiError } from '../helpers/api_response.js'

@inject()
export default class ChatsController {
  constructor(private chatService: ChatService, private systemService: SystemService) {}

  async inertia({ inertia, response }: HttpContext) {
    const aiAssistantInstalled = await this.systemService.checkServiceInstalled(SERVICE_NAMES.OLLAMA)
    if (!aiAssistantInstalled) {
      return response.status(404).json({ success: false, error: 'AI Assistant service not installed' })
    }

    const chatSuggestionsEnabled = await KVStore.getValue('chat.suggestionsEnabled')
    return inertia.render('chat', {
      settings: {
        chatSuggestionsEnabled: chatSuggestionsEnabled ?? false,
      },
    })
  }

  async index({}: HttpContext) {
    return await this.chatService.getAllSessions()
  }

  async show({ params, response }: HttpContext) {
    const sessionId = parseInt(params.id, 10)
    const session = await this.chatService.getSession(sessionId)

    if (!session) {
      return response.status(404).json({ success: false, error: 'Session not found' })
    }

    return session
  }

  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSessionSchema)
      const session = await this.chatService.createSession(data.title, data.model)
      return response.status(201).json(session)
    } catch (error) {
      return apiError(response, 500, 'Failed to create session', error)
    }
  }

  async suggestions({ response }: HttpContext) {
    try {
      const suggestions = await this.chatService.getChatSuggestions()
      return response.status(200).json({ success: true, suggestions })
    } catch (error) {
      return apiError(response, 500, 'Failed to get suggestions', error)
    }
  }

  async update({ params, request, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id, 10)
      const data = await request.validateUsing(updateSessionSchema)
      const session = await this.chatService.updateSession(sessionId, data)
      return session
    } catch (error) {
      return apiError(response, 500, 'Failed to update session', error)
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id, 10)
      await this.chatService.deleteSession(sessionId)
      return response.status(204)
    } catch (error) {
      return apiError(response, 500, 'Failed to delete session', error)
    }
  }

  async addMessage({ params, request, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id, 10)
      const data = await request.validateUsing(addMessageSchema)
      const message = await this.chatService.addMessage(sessionId, data.role, data.content)
      return response.status(201).json(message)
    } catch (error) {
      return apiError(response, 500, 'Failed to add message', error)
    }
  }

  async destroyAll({ response }: HttpContext) {
    try {
      const result = await this.chatService.deleteAllSessions()
      return response.status(200).json(result)
    } catch (error) {
      return apiError(response, 500, 'Failed to delete all sessions', error)
    }
  }
}
