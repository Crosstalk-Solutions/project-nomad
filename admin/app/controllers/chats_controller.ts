import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { ChatService } from '#services/chat_service'
import { createSessionSchema, updateSessionSchema, addMessageSchema } from '#validators/chat'
import KVStore from '#models/kv_store'
import { SystemService } from '#services/system_service'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class ChatsController {
  constructor(
    private chatService: ChatService,
    private systemService: SystemService
  ) {}

  /**
   * Exibe a interface do assistente de IA.
   */
  async inertia({ inertia, response }: HttpContext) {
    const aiAssistantInstalled = await this.systemService.checkServiceInstalled(
      SERVICE_NAMES.OLLAMA
    )

    if (!aiAssistantInstalled) {
      return response.status(404).json({
        error: 'O serviço do Assistente de IA não está instalado.',
      })
    }

    const chatSuggestionsEnabled = await KVStore.getValue('chat.suggestionsEnabled')

    return inertia.render('chat', {
      settings: {
        chatSuggestionsEnabled: chatSuggestionsEnabled ?? false,
      },
    })
  }

  /**
   * Obtém todas as sessões de conversa.
   */
  async index({}: HttpContext) {
    return await this.chatService.getAllSessions()
  }

  /**
   * Obtém uma sessão de conversa específica pelo ID.
   */
  async show({ params, response }: HttpContext) {
    const sessionId = parseInt(params.id)
    const session = await this.chatService.getSession(sessionId)

    if (!session) {
      return response.status(404).json({
        error: 'Sessão não encontrada.',
      })
    }

    return session
  }

  /**
   * Cria uma nova sessão de conversa.
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createSessionSchema)
      const session = await this.chatService.createSession(data.title, data.model)

      return response.status(201).json(session)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Falha ao criar a sessão')

      return response.status(500).json({
        error: 'Falha ao criar a sessão.',
      })
    }
  }

  /**
   * Obtém sugestões para as conversas.
   */
  async suggestions({ response }: HttpContext) {
    try {
      const suggestions = await this.chatService.getChatSuggestions()

      return response.status(200).json({ suggestions })
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Falha ao obter as sugestões')

      return response.status(500).json({
        error: 'Falha ao obter as sugestões.',
      })
    }
  }

  /**
   * Atualiza uma sessão de conversa existente.
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id)
      const data = await request.validateUsing(updateSessionSchema)
      const session = await this.chatService.updateSession(sessionId, data)

      return session
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Falha ao atualizar a sessão')

      return response.status(500).json({
        error: 'Falha ao atualizar a sessão.',
      })
    }
  }

  /**
   * Exclui uma sessão de conversa.
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id)
      await this.chatService.deleteSession(sessionId)

      return response.status(204)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Falha ao excluir a sessão')

      return response.status(500).json({
        error: 'Falha ao excluir a sessão.',
      })
    }
  }

  /**
   * Adiciona uma mensagem a uma sessão de conversa.
   */
  async addMessage({ params, request, response }: HttpContext) {
    try {
      const sessionId = parseInt(params.id)
      const data = await request.validateUsing(addMessageSchema)
      const message = await this.chatService.addMessage(
        sessionId,
        data.role,
        data.content
      )

      return response.status(201).json(message)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Falha ao adicionar a mensagem')

      return response.status(500).json({
        error: 'Falha ao adicionar a mensagem.',
      })
    }
  }

  /**
   * Exclui todas as sessões de conversa.
   */
  async destroyAll({ response }: HttpContext) {
    try {
      const result = await this.chatService.deleteAllSessions()

      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, '[ChatsController] Falha ao excluir todas as sessões')

      return response.status(500).json({
        error: 'Falha ao excluir todas as sessões.',
      })
    }
  }
}
```
