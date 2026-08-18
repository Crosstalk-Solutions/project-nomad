import { ContextWindowService } from '#services/context_window_service'
import { NomadMdService } from '#services/nomad_md_service'
import { OllamaService } from '#services/ollama_service'
import { RagService } from '#services/rag_service'
import { TokenCalibrationService } from '#services/token_calibration_service'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import {
  RAG_CONTEXT_LIMITS,
  RAG_DEFAULT_SCORE_THRESHOLD,
  RAG_DEFAULT_TOP_K,
  RAG_PLACEMENT,
  QUERY_REWRITE_MAX_TOKENS,
  SYSTEM_PROMPTS,
} from '../../constants/ollama.js'
import type { OllamaChatMessage } from '../../types/ollama.js'
import type { PipelineOptions, PipelineTrace, RetrievedChunk } from '../../types/rag.js'
import { planPrompt } from '../utils/context_budget.js'
import { estimateMessagesTokens } from '../utils/token_estimate.js'
import { resolveTasksModel } from '../utils/tasks_model.js'
import { buildContextBlock, getContextLimitsForModel } from '../utils/rag_prompt.js'

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
    private nomadMdService: NomadMdService,
    private contextWindowService: ContextWindowService,
    private tokenCalibration: TokenCalibrationService
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
    // Split the caller's conversation into the pieces the budget planner needs.
    // Caller-supplied system messages are treated as stable prefix material and
    // stay in front of everything, as before.
    const callerSystem = messages.filter((msg) => msg.role === 'system')
    const conversation = messages.filter((msg) => msg.role !== 'system')

    const systemBlocks: OllamaChatMessage[] = [...callerSystem]

    // Default formatting prompt, only when the caller supplied no system message.
    if (callerSystem.length === 0) {
      logger.debug('[RagPipeline] Injecting system prompt')
      systemBlocks.push({ role: 'system', content: SYSTEM_PROMPTS.default })
    }

    // The user-managed NOMAD.md goes in front of the formatting prompt so the
    // user's persistent instructions take precedence. Skipped in evals, where a
    // developer's personal NOMAD.md would silently skew every score.
    if (!opts.skipNomadMd) {
      const nomadPrompt = await this.nomadMdService.getSystemPrompt()
      if (nomadPrompt) {
        logger.debug('[RagPipeline] Injecting NOMAD.md system prompt')
        systemBlocks.unshift({ role: 'system', content: nomadPrompt })
      }
    }

    // The current question is the last user message; everything before it is
    // history. A conversation with no user message at all still has to produce a
    // valid payload, so fall back to an empty question.
    const lastUserIndex = conversation.map((m) => m.role).lastIndexOf('user')
    const query: OllamaChatMessage =
      lastUserIndex >= 0 ? conversation[lastUserIndex] : { role: 'user', content: '' }
    const history = lastUserIndex >= 0 ? conversation.slice(0, lastUserIndex) : conversation

    // Retrieval reads the conversation as the user wrote it — system prompts are
    // deliberately excluded. They used to be inside the rewrite window, where
    // they were transcribed as "Assistant" turns and polluted the rewritten query.
    const working: OllamaChatMessage[] = [...systemBlocks, ...conversation]

    const trace: PipelineTrace = {
      rewrittenQuery: null,
      didRewrite: false,
      retrieved: [],
      injected: [],
      messages: working,
      numCtx: undefined,
      numPredict: undefined,
      contextLimits: { maxResults: RAG_DEFAULT_TOP_K, maxTokens: 0 },
      timings: { rewriteMs: 0, retrievalMs: 0 },
    }

    // --- Retrieval -------------------------------------------------------
    // oracleContext bypasses retrieval entirely (eval `oracle` mode).
    let relevantDocs: RetrievedChunk[] = []
    if (opts.oracleContext) {
      relevantDocs = opts.oracleContext
      trace.retrieved = relevantDocs
    } else if (opts.skipRetrieval) {
      // Retrieval turned off by the user (rag.enabled). Bail before the
      // hasDocuments check, the rewrite LLM call and the vector search — the
      // whole point is to spend nothing here. relevantDocs stays empty, so no
      // context block is injected below.
      logger.debug('[RagPipeline] Retrieval disabled by setting, skipping')
    } else {
      const rewriteStart = Date.now()
      const { query: retrievalQuery, didRewrite } = await this.resolveRetrievalQuery(
        conversation,
        model,
        opts
      )
      trace.timings.rewriteMs = Date.now() - rewriteStart
      trace.rewrittenQuery = retrievalQuery
      trace.didRewrite = didRewrite

      if (retrievalQuery) {
        const retrievalStart = Date.now()
        relevantDocs = await this.ragService.searchSimilarDocuments(
          retrievalQuery,
          opts.topK ?? RAG_DEFAULT_TOP_K,
          opts.scoreThreshold ?? RAG_DEFAULT_SCORE_THRESHOLD,
          opts.collection
        )
        trace.timings.retrievalMs = Date.now() - retrievalStart
        trace.retrieved = relevantDocs
        logger.debug(
          `[RAG] Retrieved ${relevantDocs.length} relevant documents for query: "${retrievalQuery}"`
        )
      }
    }

    // --- Budgeted assembly -------------------------------------------------
    //
    // Everything above decided *what* is available; this decides what fits. The
    // model-size tier still caps how many chunks a small model is asked to read
    // (a 1B model does not get better answers from five chunks), and the budget
    // planner then enforces the hard token limit on top of that.
    const modelInfo = await this.ollamaService.getModelInfo(model).catch(() => undefined)
    const limits = getContextLimitsForModel(model, RAG_CONTEXT_LIMITS, modelInfo?.parameterSize)
    trace.contextLimits = limits
    const candidateDocs = relevantDocs.slice(0, limits.maxResults)

    const contextWindow = await this.contextWindowService.windowFor(model)
    const ratio = await this.tokenCalibration.ratioFor(model)

    const plan = planPrompt({
      systemBlocks,
      history,
      query,
      ragChunks: candidateDocs,
      renderRagBlock: (chunks) =>
        SYSTEM_PROMPTS.rag_context(buildContextBlock(chunks as RetrievedChunk[])),
      contextWindow,
      ratio,
      ragPlacement: opts.ragPlacement ?? RAG_PLACEMENT,
    })

    trace.messages = plan.messages as OllamaChatMessage[]
    trace.injected = candidateDocs.slice(0, plan.trace.chunksKept)
    trace.budget = plan.trace
    trace.numCtx = contextWindow
    trace.numPredict = plan.numPredict
    // Recorded uncalibrated so TokenCalibrationService can compare like with like;
    // applying the ratio here and again there would make the EWMA chase itself.
    trace.uncalibratedPromptTokens = estimateMessagesTokens(plan.messages, 1)

    if (plan.trace.turnsDropped > 0 || plan.trace.chunksDropped > 0 || plan.trace.queryTruncated) {
      logger.info(
        `[RagPipeline] Budget for ${model}: ${plan.trace.estimatedPromptTokens}/${plan.trace.promptBudget} tokens ` +
          `(window ${contextWindow}); dropped ${plan.trace.turnsDropped} turn(s), ` +
          `${plan.trace.chunksDropped} chunk(s)${plan.trace.queryTruncated ? ', truncated the question' : ''}`
      )
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
      // The caller now passes the conversation *without* system messages, so the
      // window can no longer scoop up system prompts and transcribe them as
      // "Assistant" turns — which is what the previous slice did on short
      // conversations, feeding the rewriter the formatting rules as if the model
      // had said them.
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

      // Route to the tasks model when one is configured. This is the ancillary
      // call that actually costs something: it runs every turn, before the
      // answer, and it sends a prompt that shares no prefix with the chat. On a
      // single-slot Ollama (OLLAMA_NUM_PARALLEL=1, the default) running it on the
      // chat model evicts that model's cached prefix, so the conversation is
      // re-prefilled from scratch on every turn no matter how stable we keep the
      // ordering. A small dedicated model keeps the chat model's cache intact.
      const rewriteModel = (await resolveTasksModel(this.ollamaService, model, undefined, '[RAG]')) ?? model

      // A rewrite is a mechanical transformation, and QUERY_REWRITE_MAX_TOKENS is far
      // too small a budget for a reasoning model to think and then answer — it would
      // spend the whole cap thinking and get truncated with no query at all. Suppress
      // reasoning at the source; `thinkingCapable` is what lets the compat transport
      // send reasoning_effort:'none' instead of nothing. Memoized per model name.
      const thinkingCapable = await this.ollamaService.checkModelHasThinking(rewriteModel)

      const response = await this.ollamaService.chat({
        model: rewriteModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.query_rewrite },
          {
            role: 'user',
            content: `Conversation:\n${conversationContext}\n\nRewritten Query:`,
          },
        ],
        // A rewrite is a short, mechanical transformation. Cap it so a chatty
        // small model can't spend a thousand tokens restating the question, and
        // pin the sampler so the same conversation rewrites the same way.
        numPredict: QUERY_REWRITE_MAX_TOKENS,
        temperature: 0,
        think: false,
        thinkingCapable,
      })

      const rewrittenQuery = response.message.content.trim()
      // Empty means the response was reasoning and nothing else (or was truncated
      // mid-thought). Embedding an empty string would search the corpus for nothing
      // and quietly poison retrieval for the rest of the conversation, so fall back
      // to the raw message — the same shape as the first-turn skip above.
      if (!rewrittenQuery) {
        logger.warn(
          `[RAG] Model "${rewriteModel}" produced no query text; falling back to the user message`
        )
        return { query: lastUserMessage?.content ?? null, didRewrite: false }
      }
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
