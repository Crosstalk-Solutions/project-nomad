import { OllamaService } from '#services/ollama_service'
import { RagService } from '#services/rag_service'
import { modelNameSchema } from '#validators/download'
import { chatSchema, getAvailableModelsSchema } from '#validators/ollama'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SYSTEM_PROMPTS } from '../../constants/ollama.js'
import logger from '@adonisjs/core/services/logger'
import type { Message } from 'ollama'

@inject()
export default class OllamaController {
  constructor(
    private ollamaService: OllamaService,
    private ragService: RagService
  ) { }

  async availableModels({ request }: HttpContext) {
    const reqData = await request.validateUsing(getAvailableModelsSchema)
    return await this.ollamaService.getAvailableModels({
      sort: reqData.sort,
      recommendedOnly: reqData.recommendedOnly,
      query: reqData.query || null,
    })
  }

  async chat({ request }: HttpContext) {
    const reqData = await request.validateUsing(chatSchema)

    // If there are no system messages in the chat
    // (i.e. first message from the user) inject system prompts
    const hasSystemMessage = reqData.messages.some((msg) => msg.role === 'system')
    if (!hasSystemMessage) {
      const systemPrompt = {
        role: 'system' as const,
        content: SYSTEM_PROMPTS.default,
      }
      reqData.messages.unshift(systemPrompt)
    }

    // Query rewriting for better RAG retrieval with manageable context
    // Will return user's latest message if no rewriting is needed
    const rewrittenQuery = await this.rewriteQueryWithContext(
      reqData.messages,
      reqData.model
    )

    if (rewrittenQuery) {
      const relevantDocs = await this.ragService.searchSimilarDocuments(
        rewrittenQuery,
        5, // Top 5 most relevant chunks
        0.3 // Minimum similarity score of 0.3
      )

      logger.debug(`[RAG] Retrieved ${relevantDocs.length} relevant documents for query: "${rewrittenQuery}"`)

      // If relevant context is found, inject as a system message
      if (relevantDocs.length > 0) {
        const contextText = relevantDocs
          .map((doc, idx) => `[Context ${idx + 1}] (Relevance: ${(doc.score * 100).toFixed(1)}%)\n${doc.text}`)
          .join('\n\n')

        const systemMessage = {
          role: 'system' as const,
          content: SYSTEM_PROMPTS.rag_context(contextText),
        }

        // Insert system message at the beginning (after any existing system messages)
        const firstNonSystemIndex = reqData.messages.findIndex((msg) => msg.role !== 'system')
        const insertIndex = firstNonSystemIndex === -1 ? 0 : firstNonSystemIndex
        reqData.messages.splice(insertIndex, 0, systemMessage)
      }
    }

    return await this.ollamaService.chat(reqData)
  }

  async deleteModel({ request }: HttpContext) {
    const reqData = await request.validateUsing(modelNameSchema)
    await this.ollamaService.deleteModel(reqData.model)
    return {
      success: true,
      message: `Model deleted: ${reqData.model}`,
    }
  }

  async dispatchModelDownload({ request }: HttpContext) {
    const reqData = await request.validateUsing(modelNameSchema)
    await this.ollamaService.dispatchModelDownload(reqData.model)
    return {
      success: true,
      message: `Download job dispatched for model: ${reqData.model}`,
    }
  }

  async installedModels({ }: HttpContext) {
    return await this.ollamaService.getModels()
  }

  private async rewriteQueryWithContext(
    messages: Message[],
    model: string
  ): Promise<string | null> {
    try {
      // Get recent conversation history (last 6 messages for 3 turns)
      const recentMessages = messages.slice(-6)

      // If there's only one user message, no rewriting needed
      const userMessages = recentMessages.filter(msg => msg.role === 'user')
      if (userMessages.length <= 1) {
        return userMessages[0]?.content || null
      }

      const conversationContext = recentMessages
        .map(msg => {
          const role = msg.role === 'user' ? 'User' : 'Assistant'
          // Truncate assistant messages to first 200 chars to keep context manageable
          const content = msg.role === 'assistant'
            ? msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '')
            : msg.content
          return `${role}: "${content}"`
        })
        .join('\n')

      const response = await this.ollamaService.chat({
        model,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPTS.query_rewrite,
          },
          {
            role: 'user',
            content: `Conversation:\n${conversationContext}\n\nRewritten Query:`,
          },
        ],
      })

      const rewrittenQuery = response.message.content.trim()
      logger.info(`[RAG] Query rewritten: "${rewrittenQuery}"`)
      return rewrittenQuery
    } catch (error) {
      logger.error(
        `[RAG] Query rewriting failed: ${error instanceof Error ? error.message : error}`
      )
      // Fallback to last user message if rewriting fails
      const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user')
      return lastUserMessage?.content || null
    }
  }
}
