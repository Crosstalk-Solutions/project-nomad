import { ChatService } from '#services/chat_service'
import { DockerService } from '#services/docker_service'
import { OllamaService, type NomadChatUsage } from '#services/ollama_service'
import { TokenCalibrationService } from '#services/token_calibration_service'
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
import { DEFAULT_KEEP_ALIVE, EMBEDDING_MODEL_NAME } from '../../constants/ollama.js'
import {
  enterLocalOnlyScope,
  getLocalOllamaUrl,
  invalidateAiBackendCache,
  isRemoteFallbackEnabled,
  shouldKeepLocalOllamaRunning,
  markRemoteReachable,
  markRemoteUnreachable,
  resolveChatBackend,
} from '#services/ai_backend_service'
import {
  fallbackNoticeMessage,
  isConnectionError,
  localOnlyNoticeMessage,
} from '../utils/ai_backend.js'
import { resolveResponseStyle } from '../utils/response_style.js'
import { resolveSamplerProfile } from '../utils/sampler.js'
import type { PipelineTrace } from '../../types/rag.js'
import type { ChatNotice } from '../../types/ollama.js'
import { buildCitations } from '../utils/rag_prompt.js'
import logger from '@adonisjs/core/services/logger'
import { rm } from 'node:fs/promises'
import {
  attachImagesToLatestUserMessage,
  ChatImageError,
  normalizeChatImages,
  type NormalizedChatImage,
} from '../utils/chat_images.js'

const PRIVATE_FILE_USED_MESSAGE =
  'This reply used a file you marked private, so this chat is now Local Only and stays on this machine.'

const LOCAL_ONLY_UNAVAILABLE_MESSAGE =
  'This is a local-only chat, but the AI Assistant on this machine is not responding. Start it from the Apps page, or turn off Local Only for this chat. Nothing was sent to the remote AI server.'

const unknownVisionCompatibilityMessage = (model: string) =>
  `NOMAD cannot confirm that "${model}" accepts images, and this image request failed. Choose a model marked "Supports images", or remove the image and try again.`

@inject()
export default class OllamaController {
  constructor(
    private chatService: ChatService,
    private dockerService: DockerService,
    private ollamaService: OllamaService,
    private ragPipelineService: RagPipelineService,
    private ragService: RagService,
    private tokenCalibration: TokenCalibrationService
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
    const uploadedImages = request.files('images', {
      size: '8mb',
      extnames: ['jpg', 'jpeg', 'png', 'webp'],
    })
    const cleanupUploadedImages = () =>
      Promise.all(
        uploadedImages
          .filter((file) => file.tmpPath)
          .map((file) => rm(file.tmpPath!, { force: true }).catch(() => undefined))
      )
    let multipartPayload: unknown
    if (uploadedImages.length > 0) {
      const rawPayload = request.input('payload')
      if (typeof rawPayload !== 'string') {
        await cleanupUploadedImages()
        return response.status(422).send({ message: 'Multipart chat requests require a JSON payload.' })
      }
      try {
        multipartPayload = JSON.parse(rawPayload)
      } catch {
        await cleanupUploadedImages()
        return response.status(422).send({ message: 'The multipart chat payload is not valid JSON.' })
      }
    }
    // A multipart chat carries the collection inside the JSON payload rather than
    // as a form field, so request.input() alone would silently drop it and every
    // image request would search the whole knowledge base.
    const rawCollection =
      uploadedImages.length > 0 &&
      multipartPayload &&
      typeof multipartPayload === 'object' &&
      'collection' in multipartPayload
        ? (multipartPayload as { collection?: unknown }).collection
        : request.input('collection', null)
    const collectionFilter: string | null =
      typeof rawCollection === 'string' && rawCollection ? rawCollection : null

    let reqData: Awaited<ReturnType<typeof chatSchema.validate>>
    try {
      reqData =
        uploadedImages.length > 0
          ? await chatSchema.validate(multipartPayload)
          : await request.validateUsing(chatSchema)
    } catch (error) {
      await cleanupUploadedImages()
      throw error
    }

    let normalizedImages: NormalizedChatImage[]
    try {
      normalizedImages = await normalizeChatImages(uploadedImages)
    } catch (error) {
      if (error instanceof ChatImageError) {
        return response.status(error.status).send({ message: error.message })
      }
      throw error
    } finally {
      await cleanupUploadedImages()
    }

    // A local-only chat never leaves this machine. Decided from the saved session
    // as well as the request, so the restriction cannot be dropped by a client
    // that omits the flag, and marked before the first Ollama call so every
    // service this turn touches resolves the local container.
    let sessionLocalOnly = reqData.sessionId
      ? await this.chatService.isSessionLocalOnly(reqData.sessionId)
      : false
    const localOnly = reqData.localOnly === true || sessionLocalOnly
    if (localOnly) {
      enterLocalOnlyScope()
    }

    // While the local container stands in for an unreachable remote server, the
    // model the user picked may only exist on that server. Resolve the stand-in
    // here, before anything below reads reqData.model, so capabilities, context
    // sizing, sampling and the title all describe the model that really answers.
    const activeBackend = await this.ollamaService.getActiveBackend()
    let fallbackNotice: ChatNotice | null = null
    if (activeBackend?.kind === 'fallback') {
      const picked = await this.ollamaService.resolveModelForBackend(reqData.model)
      fallbackNotice = {
        type: 'remote_fallback',
        requestedModel: reqData.model,
        model: picked.model,
        message: fallbackNoticeMessage({
          requestedModel: reqData.model,
          answeredBy: picked.model,
          substituted: picked.substituted,
        }),
      }
      if (picked.substituted) {
        logger.info(
          `[OllamaController] Remote AI server unreachable; answering with stand-in "${picked.model}" instead of "${reqData.model}"`
        )
      }
      reqData.model = picked.model
    } else if (activeBackend?.forcedLocal) {
      // Local-only chat with a remote configured: same stand-in rule, but only
      // worth a notice when the model actually changed — the user asked for this
      // machine, so "answered on this machine" is not news.
      const picked = await this.ollamaService.resolveModelForBackend(reqData.model)
      if (picked.substituted) {
        fallbackNotice = {
          type: 'local_only',
          requestedModel: reqData.model,
          model: picked.model,
          message: localOnlyNoticeMessage({
            requestedModel: reqData.model,
            answeredBy: picked.model,
          }),
        }
      }
      reqData.model = picked.model
    } else if (localOnly && !activeBackend) {
      // Refuse rather than fall through to the remote: see chooseChatBackend.
      return response.status(422).send({
        message:
          'This is a local-only chat, but the AI Assistant is not installed on this machine. Install it, or turn off Local Only for this chat.',
      })
    }

    const modelCapabilities = await this.ollamaService.getModelCapabilities(reqData.model)
    if (
      normalizedImages.length > 0 &&
      !reqData.messages.some((message) => message.role === 'user')
    ) {
      return response.status(422).send({ message: 'Images require a user message.' })
    }
    if (normalizedImages.length > 0 && modelCapabilities.vision === 'unsupported') {
      return response.status(422).send({
        message: `The selected model "${reqData.model}" does not support image input.`,
      })
    }

    // Flush SSE headers immediately so the client connection is open while
    // pre-processing (query rewriting, RAG lookup) runs in the background.
    if (reqData.stream) {
      response.response.setHeader('Content-Type', 'text/event-stream')
      response.response.setHeader('Cache-Control', 'no-cache')
      response.response.setHeader('Connection', 'keep-alive')
      response.response.flushHeaders()
      // Leading notice event. Like the trailing citation event it carries no
      // `message` key, which is how the client tells it apart from Ollama's chunks.
      if (fallbackNotice) {
        response.response.write(`data: ${JSON.stringify({ notice: fallbackNotice })}\n\n`)
      }
    }

    let unknownVisionUpstreamRejected = false
    try {
      // Everything from system-prompt assembly through query rewriting,
      // retrieval, context trimming and the num_ctx decision lives in
      // RagPipelineService so the eval harness exercises this exact code path.
      // Knowledge base retrieval is user-toggleable (chat header + AI Assistant
      // settings, both writing rag.enabled). Unset means on, preserving the
      // behaviour from before the toggle existed.
      const ragEnabled = (await KVStore.getValue('rag.enabled')) ?? true
      const trace = await this.ragPipelineService.buildPrompt(reqData.messages, reqData.model, {
        collection: collectionFilter ?? undefined,
        skipRetrieval: !ragEnabled,
      })
      reqData.messages = trace.messages
      // This turn read a private file. From here on the chat's history holds
      // text that must never be sent to a remote AI server, so the chat is marked
      // local-only for good — also when no remote is configured yet, so that
      // configuring one later cannot expose an old chat. Done before the reply is
      // generated: if the mark cannot be saved, the turn fails rather than
      // produce an answer the chat is not allowed to keep.
      if (reqData.sessionId && !sessionLocalOnly) {
        const injectedSources = trace.injected
          .map((chunk) => chunk.metadata?.source)
          .filter((source): source is string => typeof source === 'string')
        if (
          injectedSources.length > 0 &&
          (await this.ragService.hasPrivateSource(injectedSources))
        ) {
          await this.chatService.markSessionLocalOnly(reqData.sessionId)
          sessionLocalOnly = true
          // Tell the user why the Local Only switch just turned itself on and
          // locked. Appended to any stand-in notice rather than replacing it.
          fallbackNotice = {
            type: 'local_only',
            requestedModel: fallbackNotice?.requestedModel ?? reqData.model,
            model: reqData.model,
            message: [fallbackNotice?.message, PRIVATE_FILE_USED_MESSAGE].filter(Boolean).join(' '),
          }
          if (reqData.stream) {
            response.response.write(`data: ${JSON.stringify({ notice: fallbackNotice })}\n\n`)
          }
        }
      }
      const numCtx = trace.numCtx
      const numPredict = trace.numPredict
      // Provenance for the answer about to be generated (#1179). Built from
      // trace.injected -- what the model actually read -- and surfaced under the
      // answer as "Sources". Empty whenever retrieval was skipped or declined,
      // which is the honest result: no context, no citations.
      const sources = buildCitations(trace.injected)
      // Keeping the model resident is what makes the KV cache worth building:
      // Ollama's default evicts after 5 minutes, which is well inside the time a
      // user spends reading an answer and typing the next question.
      const keepAlive = (await KVStore.getValue('ai.keepAlive')) || DEFAULT_KEEP_ALIVE

      // Check if the model supports "thinking" capability for enhanced response generation.
      // Thinking is only enabled when the model supports it AND the user wants it: the explicit
      // per-request preference wins, otherwise the global default (ai.autoThinking, default OFF).
      // If gpt-oss model, it requires a text param for "think" https://docs.ollama.com/api/chat
      // One /api/show read, memoized per model, for two decisions: whether the
      // model can think, and what sampler values its author baked in.
      const modelInfo = await this.ollamaService.getModelInfo(reqData.model)
      const thinkingCapability = modelInfo.hasThinking
      let thinkingEnabled = false
      if (thinkingCapability) {
        thinkingEnabled = reqData.think ?? ((await KVStore.getValue('ai.autoThinking')) ?? false)
      }
      const think: boolean | 'medium' =
        thinkingEnabled ? (reqData.model.startsWith('gpt-oss') ? 'medium' : true) : false

      // Sampler settings for this turn. Chat used to send none of these and
      // inherit the backend's defaults, which on a heavily quantized small model
      // is the wandering, repetitive output people read as "the local model is
      // bad". Resolved here rather than in OllamaService so the ancillary
      // structured calls, which want temperature 0 and a grammar, stay untouched.
      const sampler = resolveSamplerProfile(
        await resolveResponseStyle(),
        modelInfo.modelfileSamplers
      )

      // Separate sessionId and the resolved thinking preference from the Ollama request payload —
      // Ollama rejects unknown fields, and `think` is re-derived above (not forwarded raw).
      const { sessionId, think: _thinkPref, localOnly: _localOnly, ...ollamaRequest } = reqData
      const upstreamMessages = attachImagesToLatestUserMessage(
        ollamaRequest.messages,
        normalizedImages
      )

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
        let fullContent = ''
        let doneReason: string | undefined
        let completionTokens: number | undefined
        try {
          const stream = await this.ollamaService.chatStream({
            ...ollamaRequest,
            messages: upstreamMessages,
            think,
            thinkingCapable: thinkingCapability,
            numCtx,
            numPredict,
            keepAlive,
          sampler,
            signal: abortController.signal,
          })
          for await (const chunk of stream) {
            if (chunk.message?.content) {
              fullContent += chunk.message.content
            }
            if (chunk.usage) {
              completionTokens = chunk.usage.completionTokens
              this._recordUsage(reqData.model, trace, chunk.usage)
            }
            if (chunk.done_reason) doneReason = chunk.done_reason
            response.response.write(`data: ${JSON.stringify(chunk)}\n\n`)
          }
        } catch (err) {
          if (abortController.signal.aborted) {
            logger.debug('[OllamaController] Client disconnected; aborted upstream Ollama generation')
            return
          }
          unknownVisionUpstreamRejected =
            normalizedImages.length > 0 && modelCapabilities.vision === 'unknown'
          throw err
        }
        if (doneReason === 'length') {
          this._logLengthStop(reqData.model, numCtx, numPredict, completionTokens)
        }
        // Trailing citation event, written before end(). It carries no `message`
        // key, which is how the client tells it apart from Ollama's own chunks.
        if (sources.length > 0) {
          response.response.write(`data: ${JSON.stringify({ sources })}

`)
        }
        response.response.end()

        // Save assistant message and optionally generate title
        if (sessionId && fullContent) {
          await this.chatService.addMessage(sessionId, 'assistant', fullContent, sources)
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
      let result
      try {
        result = await this.ollamaService.chat({
          ...ollamaRequest,
          messages: upstreamMessages,
          think,
          thinkingCapable: thinkingCapability,
          numCtx,
          numPredict,
          keepAlive,
        sampler,
        })
      } catch (err) {
        // A backend that never advertised vision support rejecting a request that
        // carried images is the signal that it cannot see them. Recorded here and
        // translated into the compatibility message by the outer catch.
        unknownVisionUpstreamRejected =
          normalizedImages.length > 0 && modelCapabilities.vision === 'unknown'
        throw err
      }
      if (result?.usage) {
        this._recordUsage(reqData.model, trace, result.usage)
      }
      if (result?.done_reason === 'length') {
        this._logLengthStop(reqData.model, numCtx, numPredict, result.usage?.completionTokens)
      }

      if (sessionId && result?.message?.content) {
        await this.chatService.addMessage(sessionId, 'assistant', result.message.content, sources)
        const messageCount = await this.chatService.getMessageCount(sessionId)
        if (messageCount <= 2 && userContent) {
          this.chatService.generateTitle(sessionId, userContent, result.message.content, reqData.model).catch((err) => {
            logger.error(`[OllamaController] Title generation failed: ${err instanceof Error ? err.message : err}`)
          })
        }
      }

      return { ...result, sources, ...(fallbackNotice ? { notice: fallbackNotice } : {}) }
    } catch (error) {
      // The remote answered its last probe but this request could not reach it:
      // it went away in between. Record that, so with fallback enabled the user's
      // retry is answered locally at once rather than after the verdict expires.
      if (activeBackend?.kind === 'remote' && isConnectionError(error)) {
        markRemoteUnreachable(activeBackend.baseUrl)
      }
      // A local-only chat whose local container did not answer. It was not, and
      // must not be, retried against the remote — so say why it failed instead
      // of leaving a bare error next to a "Remote Connected" badge.
      const localOnlyUnavailable = localOnly && isConnectionError(error)
      if (reqData.stream) {
        const streamError =
          unknownVisionUpstreamRejected
            ? {
                error: true,
                message: unknownVisionCompatibilityMessage(reqData.model),
              }
            : localOnlyUnavailable
              ? { error: true, message: LOCAL_ONLY_UNAVAILABLE_MESSAGE }
              : { error: true }
        response.response.write(`data: ${JSON.stringify(streamError)}\n\n`)
        response.response.end()
        return
      }
      if (localOnlyUnavailable) {
        return response.status(503).send({ message: LOCAL_ONLY_UNAVAILABLE_MESSAGE })
      }
      if (unknownVisionUpstreamRejected) {
        return response.status(422).send({
          message: unknownVisionCompatibilityMessage(reqData.model),
        })
      }
      throw error
    }
  }

  /**
   * A reply that hit the generation cap reaches the user cut off. The client
   * shows that from done_reason; this puts it in the admin log with the numbers
   * needed to tell a small window from a cap that is set too low (#1342).
   */
  private _logLengthStop(
    model: string,
    numCtx: number | undefined,
    numPredict: number | undefined,
    completionTokens: number | undefined
  ): void {
    logger.info(
      `[OllamaController] ${model} stopped at the length limit: ` +
        `${completionTokens ?? '?'} tokens generated, num_predict=${numPredict ?? 'unset'}, num_ctx=${numCtx ?? 'unset'}`
    )
  }

  /**
   * Close the loop on token accounting.
   *
   * The backend just told us exactly how many tokens the prompt really was.
   * Comparing that against what we estimated is what lets the estimator correct
   * itself per model — free ground truth that used to be discarded. Also logs
   * the prefill rate, which is the practical prefix-cache-hit signal: a reused
   * KV prefix means many prompt tokens for very little prefill time.
   *
   * Best-effort throughout; a calibration failure must never affect the reply.
   */
  private _recordUsage(model: string, trace: PipelineTrace, usage: NomadChatUsage): void {
    if (trace.uncalibratedPromptTokens && usage.promptTokens) {
      this.tokenCalibration
        .record(model, trace.uncalibratedPromptTokens, usage.promptTokens)
        .catch((err) => {
          logger.debug(`[OllamaController] Token calibration failed: ${err?.message ?? err}`)
        })

      if (usage.promptEvalMs !== undefined && usage.promptEvalMs > 0) {
        const tokensPerMs = usage.promptTokens / usage.promptEvalMs
        logger.debug(
          `[OllamaController] Prefill: ${usage.promptTokens} tokens in ${usage.promptEvalMs.toFixed(0)}ms ` +
            `(${tokensPerMs.toFixed(1)} tok/ms; a high rate means the KV prefix was reused)`
        )
      }
    }
  }

  async remoteStatus() {
    const remoteUrl = await KVStore.getValue('ai.remoteOllamaUrl')
    if (!remoteUrl) {
      return { configured: false, connected: false, fallbackEnabled: false, usingFallback: false }
    }
    const fallbackEnabled = await isRemoteFallbackEnabled()
    let connected = false
    try {
      const testResponse = await fetch(`${remoteUrl.replace(/\/$/, '')}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      })
      connected = testResponse.ok
    } catch {
      connected = false
    }
    // usingFallback answers "who would reply if I sent a message now?", which is
    // not simply !connected: fallback also needs the local container to be up.
    let usingFallback = false
    if (fallbackEnabled && !connected) {
      markRemoteUnreachable(remoteUrl)
      usingFallback = (await resolveChatBackend())?.kind === 'fallback'
    } else if (fallbackEnabled) {
      // The chat page polls this endpoint, so an open chat ends a fallback as
      // soon as the remote answers instead of one verdict lifetime later.
      markRemoteReachable(remoteUrl)
    }
    return { configured: true, connected, fallbackEnabled, usingFallback }
  }

  /**
   * Models installed in the local Ollama container, regardless of any remote
   * configuration. Feeds the stand-in model picker: while a remote server is
   * configured, the ordinary model list describes that server, not this machine.
   */
  async localModels() {
    const localUrl = await getLocalOllamaUrl()
    if (!localUrl) {
      return { available: false, models: [] as string[] }
    }
    try {
      const tagsResponse = await fetch(`${localUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      })
      if (!tagsResponse.ok) {
        return { available: false, models: [] as string[] }
      }
      const body = (await tagsResponse.json()) as { models?: Array<{ name?: unknown }> }
      const models = (Array.isArray(body?.models) ? body.models : [])
        .map((model) => model?.name)
        .filter((name): name is string => typeof name === 'string' && name !== EMBEDDING_MODEL_NAME)
      return { available: true, models }
    } catch {
      return { available: false, models: [] as string[] }
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
      invalidateAiBackendCache()
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

    // A new remote must not inherit the previous server's reachability verdict.
    invalidateAiBackendCache()

    // Stop the local nomad_ollama container (if running) so it doesn't compete with the
    // remote host for GPU / port 11434. Preserves the container and its models volume.
    // With ai.remoteFallbackEnabled or rag.localEmbeddings the user has asked for
    // the opposite: the local container stays up (and is started if it was
    // stopped) so it can stand in whenever the remote is unreachable, or keep
    // doing the knowledge base's embedding.
    if (await shouldKeepLocalOllamaRunning()) {
      await this.dockerService.startLocalOllamaContainerIfExists('needed alongside remote Ollama')
    } else {
      await this._stopLocalOllamaContainer()
    }

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
    await this.dockerService.stopLocalOllamaContainer('remote Ollama configured')
  }

  private async _startLocalOllamaContainerIfExists(): Promise<boolean> {
    return this.dockerService.startLocalOllamaContainerIfExists('remote Ollama cleared')
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
    const models = await this.ollamaService.getModels()
    // Enrich from backend-reported capabilities; never guess from model names.
    const capabilities = await Promise.all(
      models.map((m) => this.ollamaService.getModelCapabilities(m.name, m))
    )
    return models.map((m, i) => ({ ...m, ...capabilities[i] }))
  }

}
