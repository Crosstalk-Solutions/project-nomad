import { NomadMdService } from '#services/nomad_md_service'
import { OllamaService } from '#services/ollama_service'
import { RagService } from '#services/rag_service'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import {
  RAG_CONTEXT_LIMITS,
  RAG_DEFAULT_SCORE_THRESHOLD,
  RAG_DEFAULT_TOP_K,
  SYSTEM_PROMPTS,
} from '../../constants/ollama.js'
import type { OllamaChatMessage } from '../../types/ollama.js'
import type { PipelineOptions, PipelineTrace, RetrievedChunk } from '../../types/rag.js'
import {
  buildContextBlock,
  deriveNumCtx,
  getContextLimitsForModel,
  trimToContextBudget,
} from '../utils/rag_prompt.js'

/**
 * Everything that happens between "a user sent a message" and "a payload goes
 * to Ollama": system-prompt assembly, history-aware query rewriting, retrieval,
 * model-size-aware context trimming, and the num_ctx decision.
 *
 * This used to live inline in OllamaController.chat. It was moved here so there
 * is exactly one implementation of the prompt-building pipeline — the chat
 * endpoint and the eval harness both call `buildPrompt`, so a measurement of
 * the harness is a measurement of production, not of a copy that drifts.
 *
 * The behaviour is a verbatim port. Every quirk preserved below is marked; the
 * quirks are worth fixing but each one changes output, and the point of the
 * harness is to stop changing output without measuring it.
 */
@inject()
export class RagPipelineService {
  constructor(
    private ollamaService: OllamaService,
    private ragService: RagService,
    private nomadMdService: NomadMdService
  ) {}

  /**
   * Build the exact message array to send to Ollama, plus a trace of every
   * decision made along the way.
   *
   * The caller passes the conversation as received; this never mutates it.
   */
  async buildPrompt(
    messages: OllamaChatMessage[],
    model: string,
    opts: PipelineOptions = {}
  ): Promise<PipelineTrace> {
    const working: OllamaChatMessage[] = [...messages]

    // Default formatting prompt, only when the caller supplied no system message.
    const hasSystemMessage = working.some((msg) => msg.role === 'system')
    if (!hasSystemMessage) {
      logger.debug('[RagPipeline] Injecting system prompt')
      working.unshift({ role: 'system', content: SYSTEM_PROMPTS.default })
    }

    // The user-managed NOMAD.md goes in front of the formatting prompt so the
    // user's persistent instructions take precedence. Skipped in evals, where a
    // developer's personal NOMAD.md would silently skew every score.
    if (!opts.skipNomadMd) {
      const nomadPrompt = await this.nomadMdService.getSystemPrompt()
      if (nomadPrompt) {
        logger.debug('[RagPipeline] Injecting NOMAD.md system prompt')
        working.unshift({ role: 'system', content: nomadPrompt })
      }
    }

    const trace: PipelineTrace = {
      rewrittenQuery: null,
      didRewrite: false,
      retrieved: [],
      injected: [],
      messages: working,
      numCtx: undefined,
      contextLimits: { maxResults: RAG_DEFAULT_TOP_K, maxTokens: 0 },
      timings: { rewriteMs: 0, retrievalMs: 0 },
    }

    // --- Retrieval -------------------------------------------------------
    // oracleContext bypasses retrieval entirely (eval `oracle` mode).
    let relevantDocs: RetrievedChunk[] = []
    if (opts.oracleContext) {
      relevantDocs = opts.oracleContext
      trace.retrieved = relevantDocs
    } else {
      const rewriteStart = Date.now()
      const { query, didRewrite } = await this.resolveRetrievalQuery(working, model, opts)
      trace.timings.rewriteMs = Date.now() - rewriteStart
      trace.rewrittenQuery = query
      trace.didRewrite = didRewrite

      if (query) {
        const retrievalStart = Date.now()
        relevantDocs = await this.ragService.searchSimilarDocuments(
          query,
          opts.topK ?? RAG_DEFAULT_TOP_K,
          opts.scoreThreshold ?? RAG_DEFAULT_SCORE_THRESHOLD,
          opts.collection
        )
        trace.timings.retrievalMs = Date.now() - retrievalStart
        trace.retrieved = relevantDocs
        logger.debug(
          `[RAG] Retrieved ${relevantDocs.length} relevant documents for query: "${query}"`
        )
      }
    }

    // --- Context trimming + injection -------------------------------------
    if (relevantDocs.length > 0) {
      const limits = getContextLimitsForModel(model, RAG_CONTEXT_LIMITS)
      trace.contextLimits = limits
      const trimmedDocs = trimToContextBudget(relevantDocs, limits)
      trace.injected = trimmedDocs

      logger.debug(
        `[RAG] Injecting ${trimmedDocs.length}/${relevantDocs.length} results (model: ${model}, maxResults: ${limits.maxResults}, maxTokens: ${limits.maxTokens || 'unlimited'})`
      )

      const systemMessage: OllamaChatMessage = {
        role: 'system',
        content: SYSTEM_PROMPTS.rag_context(buildContextBlock(trimmedDocs)),
      }

      // After any existing system messages, before the first non-system message.
      const firstNonSystemIndex = working.findIndex((msg) => msg.role !== 'system')
      const insertIndex = firstNonSystemIndex === -1 ? 0 : firstNonSystemIndex
      working.splice(insertIndex, 0, systemMessage)
    }

    trace.numCtx = deriveNumCtx(working)
    if (trace.numCtx) {
      logger.debug(`[RagPipeline] Large system prompt, requesting num_ctx: ${trace.numCtx}`)
    }

    return trace
  }

  /**
   * Decide what string to hand to retrieval.
   *
   * Returns null when the RAG pipeline should be skipped entirely — an empty
   * knowledge base, or a conversation with no user message at all.
   */
  private async resolveRetrievalQuery(
    messages: OllamaChatMessage[],
    model: string,
    opts: PipelineOptions
  ): Promise<{ query: string | null; didRewrite: boolean }> {
    const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user')

    try {
      // Skip the entire RAG pipeline if there are no documents to search.
      const hasDocuments = await this.ragService.hasDocuments()
      if (!hasDocuments) {
        return { query: null, didRewrite: false }
      }

      if (opts.skipQueryRewrite) {
        return { query: lastUserMessage?.content ?? null, didRewrite: false }
      }

      // Last 6 messages ≈ 3 turns.
      //
      // PRESERVED QUIRK: this slice is taken *after* system messages have been
      // unshifted, so on short conversations the system prompts land inside the
      // window and get labelled "Assistant" in the transcript below. Faithful
      // to the original; a candidate fix once the harness can measure it.
      const recentMessages = messages.slice(-6)

      // Skip rewriting on the very first turn — with only one user message there
      // is no prior context to fold in, so the rewrite would just echo the
      // message back at the cost of an extra LLM round-trip. From the first
      // follow-up onward the rewrite carries entities from earlier turns
      // ("the bars" -> "Hershey's bars chocolate poisoning dog"); without it,
      // embeddings match nothing and the assistant loses the thread.
      const userMessages = recentMessages.filter((msg) => msg.role === 'user')
      if (userMessages.length < 2) {
        return { query: lastUserMessage?.content ?? null, didRewrite: false }
      }

      const conversationContext = recentMessages
        .map((msg) => {
          const role = msg.role === 'user' ? 'User' : 'Assistant'
          // Truncate assistant messages to keep the rewrite prompt manageable.
          const content =
            msg.role === 'assistant'
              ? msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '')
              : msg.content
          return `${role}: "${content}"`
        })
        .join('\n')

      const response = await this.ollamaService.chat({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.query_rewrite },
          {
            role: 'user',
            content: `Conversation:\n${conversationContext}\n\nRewritten Query:`,
          },
        ],
      })

      const rewrittenQuery = response.message.content.trim()
      logger.info(`[RAG] Query rewritten: "${rewrittenQuery}"`)
      return { query: rewrittenQuery, didRewrite: true }
    } catch (error) {
      logger.error(
        `[RAG] Query rewriting failed: ${error instanceof Error ? error.message : error}`
      )
      // Fall back to the last user message rather than losing retrieval entirely.
      return { query: lastUserMessage?.content ?? null, didRewrite: false }
    }
  }

}
