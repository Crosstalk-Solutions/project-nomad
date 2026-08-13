import { ChatService } from '#services/chat_service'
import { DockerService } from '#services/docker_service'
import { OllamaService } from '#services/ollama_service'
import { RagPipelineService } from '#services/rag_pipeline_service'
import { RagService } from '#services/rag_service'
import Service from '#models/service'
import KVStore from '#models/kv_store'
import { modelNameSchema } from '#validators/download'
import { chatSchema, getAvailableModelsSchema, unloadChatModelsSchema } from '#validators/ollama'
import { assertNotCloudMetadataUrl } from '#validators/common'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class OllamaController {
  constructor(
    private chatService: ChatService,
    private dockerService: DockerService,
    private ollamaService: OllamaService,
    private ragPipelineService: RagPipelineService,
    private ragService: RagService
  ) { }

  async availableModels({ request }: HttpContext) {
    const reqData = await request.validateUsing(getAvailableModelsSchema)
    return await this.ollamaService.getAvailableModels({
      sort: reqData.sort,
      recommendedOnly: reqData.recommendedOnly,
      query: reqData.query || null,
      limit: reqData.limit || 15,
      force: reqData.force,
    })
  }

  /**
   * Send Ollama `keep_alive: 0` hints to every currently-loaded chat model
   * except the embedding model and (optionally) a target model to preserve.
   * Used by the chat UI to enforce the "one chat model at a time" invariant
   * on model-switch, session-switch, and page-load. Best-effort: a failure
   * here should not block the calling flow.
   */
  async unloadChatModels({ request, response }: HttpContext) {
    const { targetModel } = await request.validateUsing(unloadChatModelsSchema)
    const unloaded = await this.ollamaService.unloadAllChatModelsExcept(targetModel ?? null)
    return response.status(200).json({ unloaded })
  }

  async chat({ request, response }: HttpContext) {
    const reqData = await request.validateUsing(chatSchema)

    // Flush SSE headers immediately so the client connection is open while
    // pre-processing (query rewriting, RAG lookup) runs in the background.
    if (reqData.stream) {
      response.response.setHeader('Content-Type', 'text/event-stream')
      response.response.setHeader('Cache-Control', 'no-cache')
      response.response.setHeader('Connection', 'keep-alive')
      response.response.flushHeaders()
    }

    try {
      // Everything from system-prompt assembly through query rewriting,
      // retrieval, context trimming and the num_ctx decision lives in
      // RagPipelineService so the eval harness exercises this exact code path.
      const collectionFilter: string | null = request.input('collection', null)
      const trace = await this.ragPipelineService.buildPrompt(reqData.messages, reqData.model, {
        collection: collectionFilter ?? undefined,
      })
      reqData.messages = trace.messages
      const numCtx = trace.numCtx

      // Check if the model supports "thinking" capability for enhanced response generation.
      // Thinking is only enabled when the model supports it AND the user wants it: the explicit
      // per-request preference wins, otherwise the global default (ai.autoThinking, default OFF).
      // If gpt-oss model, it requires a text param for "think" https://docs.ollama.com/api/chat
      const thinkingCapability = await this.ollamaService.checkModelHasThinking(reqData.model)
      let thinkingEnabled = false
      if (thinkingCapability) {
        thinkingEnabled = reqData.think ?? ((await KVStore.getValue('ai.autoThinking')) ?? false)
      }
      const think: boolean | 'medium' =
        thinkingEnabled ? (reqData.model.startsWith('gpt-oss') ? 'medium' : true) : false

      // Separate sessionId and the resolved thinking preference from the Ollama request payload —
      // Ollama rejects unknown fields, and `think` is re-derived above (not forwarded raw).
      const { sessionId, think: _thinkPref, ...ollamaRequest } = reqData

      // Save user message to DB before streaming if sessionId provided
      let userContent: string | null = null
      if (sessionId) {
        const lastUserMsg = [...reqData.messages].reverse().find((m) => m.role === 'user')
        if (lastUserMsg) {
          userContent = lastUserMsg.content
          await this.chatService.addMessage(sessionId, 'user', userContent)
        }
      }

      if (reqData.stream) {
        logger.debug(`[OllamaController] Initiating streaming response for model: "${reqData.model}" with think: ${think}`)
        // Headers already flushed above.
        // Abort the upstream generation if the client disconnects — otherwise an abandoned
        // request keeps decoding server-side and, with Ollama's default OLLAMA_NUM_PARALLEL=1,
        // blocks every later chat/RAG request until the model is manually stopped (#1065).
        const abortController = new AbortController()
        response.response.on('close', () => abortController.abort())
        const stream = await this.ollamaService.chatStream({
          ...ollamaRequest,
          think,
          thinkingCapable: thinkingCapability,
          numCtx,
          signal: abortController.signal,
        })
        let fullContent = ''
        try {
          for await (const chunk of stream) {
            if (chunk.message?.content) {
              fullContent += chunk.message.content
            }
            response.response.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        } catch (err) {
          if (abortController.signal.aborted) {
            logger.debug('[OllamaController] Client disconnected; aborted upstream Ollama generation')
            return
          }
          throw err
        }
        response.response.end()

        // Save assistant message and optionally generate title
        if (sessionId && fullContent) {
          await this.chatService.addMessage(sessionId, 'assistant', fullContent)
          const messageCount = await this.chatService.getMessageCount(sessionId)
          if (messageCount <= 2 && userContent) {
            this.chatService.generateTitle(sessionId, userContent, fullContent, reqData.model).catch((err) => {
              logger.error(`[OllamaController] Title generation failed: ${err instanceof Error ? err.message : err}`)
            })
          }
        }
        return
      }

      // Non-streaming (legacy) path
      const result = await this.ollamaService.chat({ ...ollamaRequest, think, thinkingCapable: thinkingCapability, numCtx })

      if (sessionId && result?.message?.content) {
        await this.chatService.addMessage(sessionId, 'assistant', result.message.content)
        const messageCount = await this.chatService.getMessageCount(sessionId)
        if (messageCount <= 2 && userContent) {
          this.chatService.generateTitle(sessionId, userContent, result.message.content, reqData.model).catch((err) => {
            logger.error(`[OllamaController] Title generation failed: ${err instanceof Error ? err.message : err}`)
          })
        }
      }

      return result
    } catch (error) {
      if (reqData.stream) {
        response.response.write(`data: ${JSON.stringify({ error: true })}\n\n`)
        response.response.end()
        return
      }
      throw error
    }
  }

  async remoteStatus() {
    const remoteUrl = await KVStore.getValue('ai.remoteOllamaUrl')
    if (!remoteUrl) {
      return { configured: false, connected: false }
    }
    try {
      const testResponse = await fetch(`${remoteUrl.replace(/\/$/, '')}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      })
      return { configured: true, connected: testResponse.ok }
    } catch {
      return { configured: true, connected: false }
    }
  }

  async configureRemote({ request, response }: HttpContext) {
    const remoteUrl: string | null = request.input('remoteUrl', null)

    const ollamaService = await Service.query().where('service_name', SERVICE_NAMES.OLLAMA).first()
    if (!ollamaService) {
      return response.status(404).send({ success: false, message: 'Ollama service record not found.' })
    }

    // Clear path: null or empty URL removes remote config. If a local nomad_ollama container
    // still exists (user had previously installed AI Assistant locally), restart it and keep
    // the service marked installed. Otherwise fall back to uninstalled.
    if (!remoteUrl || remoteUrl.trim() === '') {
      await KVStore.clearValue('ai.remoteOllamaUrl')
      const hasLocalContainer = await this._startLocalOllamaContainerIfExists()
      ollamaService.installed = hasLocalContainer
      ollamaService.installation_status = 'idle'
      await ollamaService.save()
      return {
        success: true,
        message: hasLocalContainer
          ? 'Remote Ollama cleared. Local Ollama container restored.'
          : 'Remote Ollama configuration cleared.',
      }
    }

    try {
      assertNotCloudMetadataUrl(remoteUrl)
    } catch (err) {
      return response.status(400).send({
        success: false,
        message: err instanceof Error ? err.message : 'Invalid URL.',
      })
    }

    // Test connectivity via OpenAI-compatible /v1/models endpoint (works with Ollama, LM Studio, llama.cpp, etc.)
    try {
      const testResponse = await fetch(`${remoteUrl.replace(/\/$/, '')}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!testResponse.ok) {
        return response.status(400).send({
          success: false,
          message: `Could not connect to ${remoteUrl} (HTTP ${testResponse.status}). Make sure the server is running and accessible. For Ollama, start it with OLLAMA_HOST=0.0.0.0.`,
        })
      }
    } catch (error) {
      return response.status(400).send({
        success: false,
        message: `Could not connect to ${remoteUrl}. Make sure the server is running and reachable. For Ollama, start it with OLLAMA_HOST=0.0.0.0.`,
      })
    }

    // Save remote URL and mark service as installed
    await KVStore.setValue('ai.remoteOllamaUrl', remoteUrl.trim())
    ollamaService.installed = true
    ollamaService.installation_status = 'idle'
    await ollamaService.save()

    // Stop the local nomad_ollama container (if running) so it doesn't compete with the
    // remote host for GPU / port 11434. Preserves the container and its models volume.
    await this._stopLocalOllamaContainer()

    // Install Qdrant if not already installed (fire-and-forget)
    const qdrantService = await Service.query().where('service_name', SERVICE_NAMES.QDRANT).first()
    if (qdrantService && !qdrantService.installed) {
      this.dockerService.createContainerPreflight(SERVICE_NAMES.QDRANT).catch((error) => {
        logger.error('[OllamaController] Failed to start Qdrant preflight:', error)
      })
    }

    // Mirror post-install side effects: disable suggestions, trigger docs discovery
    await KVStore.setValue('chat.suggestionsEnabled', false)
    this.ragService.discoverNomadDocs().catch((error) => {
      logger.error('[OllamaController] Failed to discover Nomad docs:', error)
    })

    return { success: true, message: 'Remote Ollama configured.' }
  }

  private async _stopLocalOllamaContainer(): Promise<void> {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: true })
      const ollamaContainer = containers.find((c) =>
        c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`)
      )
      if (!ollamaContainer || ollamaContainer.State !== 'running') {
        return
      }
      await this.dockerService.docker.getContainer(ollamaContainer.Id).stop()
      this.dockerService.invalidateServicesStatusCache()
      logger.info('[OllamaController] Stopped local nomad_ollama (remote Ollama configured)')
    } catch (error: any) {
      logger.error(
        { err: error },
        '[OllamaController] Failed to stop local nomad_ollama; remote Ollama is still active'
      )
    }
  }

  private async _startLocalOllamaContainerIfExists(): Promise<boolean> {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: true })
      const ollamaContainer = containers.find((c) =>
        c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`)
      )
      if (!ollamaContainer) {
        return false
      }
      if (ollamaContainer.State !== 'running') {
        await this.dockerService.docker.getContainer(ollamaContainer.Id).start()
        this.dockerService.invalidateServicesStatusCache()
        logger.info('[OllamaController] Started local nomad_ollama (remote Ollama cleared)')
      }
      return true
    } catch (error: any) {
      logger.error(
        { err: error },
        '[OllamaController] Failed to start local nomad_ollama on remote clear'
      )
      return false
    }
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
    const models = await this.ollamaService.getModels()
    // Enrich each model with its thinking capability so the chat picker knows which models
    // to show the per-model thinking toggle for. checkModelHasThinking memoizes /api/show
    // results, so this stays cheap on repeat loads. Best-effort per model.
    const thinking = await Promise.all(
      models.map((m) => this.ollamaService.checkModelHasThinking(m.name))
    )
    return models.map((m, i) => ({ ...m, thinking: thinking[i] }))
  }

}
