import { OllamaService } from '#services/ollama_service'
import { RagService } from '#services/rag_service'
import { modelNameSchema } from '#validators/download'
import { chatSchema, getAvailableModelsSchema } from '#validators/ollama'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SYSTEM_PROMPTS } from '../../constants/ollama.js'

@inject()
export default class OllamaController {
  constructor(
    private ollamaService: OllamaService,
    private ragService: RagService
  ) {}

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

    /**If there are no system messages in the chat
     *(i.e. first message from the user)inject system prompts
     **/
    const hasSystemMessage = reqData.messages.some((msg) => msg.role === 'system')
    if (!hasSystemMessage) {
      const systemPrompt = {
        role: 'system' as const,
        content: SYSTEM_PROMPTS.default,
      }
      reqData.messages.unshift(systemPrompt)
    }

    // Get the last user message to use for RAG context retrieval
    const lastUserMessage = [...reqData.messages].reverse().find((msg) => msg.role === 'user')

    if (lastUserMessage) {
      // Search for relevant context in the knowledge base
      // Using lower threshold (0.3) with improved hybrid search
      const relevantDocs = await this.ragService.searchSimilarDocuments(
        lastUserMessage.content,
        5, // Retrieve top 5 most relevant chunks
        0.3 // Minimum similarity score of 0.3 (lowered from 0.7 for better recall)
      )

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

  async installedModels({}: HttpContext) {
    return await this.ollamaService.getModels()
  }
}
