import { OllamaService } from '#services/ollama_service'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import { RELEVANCE_CHECK_MAX_TOKENS, SYSTEM_PROMPTS } from '../../constants/ollama.js'
import type { RetrievedChunk } from '../../types/rag.js'
import {
  buildJudgeInput,
  isRelevanceCheckEnabled,
  ON_TOPIC_SCHEMA,
  pickOnTopic,
} from '../utils/relevance_judge.js'
import { resolveStructured } from '../utils/structured_output.js'
import { resolveTasksModel } from '../utils/tasks_model.js'

export type JudgeResult = {
  /** Every chunk when the model said they fit the question, none when it said not. */
  kept: RetrievedChunk[]
  /** How many were dropped. 0 when the check failed open. */
  rejected: number
  /** False when the call failed and every chunk was kept unjudged. */
  judged: boolean
  ms: number
}

/**
 * Asks a model whether the retrieved chunks are about what the user asked, and
 * drops them all when it says no (#1341). Runs after the relevance floor, so it
 * only ever sees the few chunks that were about to be injected and cited.
 *
 * Fails open by design. The floor has already removed the noise; this removes
 * the coherent-but-off-topic remainder. A timeout or a garbled verdict costing
 * one turn that precision is a much smaller failure than an answerable question
 * losing its context because a model misbehaved.
 */
@inject()
export class RelevanceJudgeService {
  constructor(private ollamaService: OllamaService) {}

  /**
   * The model to run the check on this turn, or null to skip it. Opt-in via
   * `rag.relevanceCheck`; runs on the tasks model when one is configured and on
   * the chat model otherwise.
   */
  async resolveModel(chatModel: string): Promise<string | null> {
    try {
      if (!isRelevanceCheckEnabled(await KVStore.getValue('rag.relevanceCheck'))) return null
    } catch (error) {
      logger.warn(
        `[RAG] Failed to read rag.relevanceCheck, skipping the check: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
    return resolveTasksModel(this.ollamaService, chatModel, undefined, '[RAG]')
  }

  async judge(question: string, chunks: RetrievedChunk[], model: string): Promise<JudgeResult> {
    const started = Date.now()
    const unjudged = (): JudgeResult => ({
      kept: chunks,
      rejected: 0,
      judged: false,
      ms: Date.now() - started,
    })
    if (chunks.length === 0 || !question.trim()) return unjudged()

    try {
      const thinkingCapable = await this.ollamaService.checkModelHasThinking(model)
      const response = await this.ollamaService.chat({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.relevance_check },
          {
            role: 'user',
            content: buildJudgeInput(
              question,
              chunks.map((c) => ({
                text: c.text,
                // Titles only from content metadata. A filename is not a claim
                // about what a passage says, and in the eval corpus it would
                // hand the judge the answer ("distractor-…").
                title:
                  c.metadata?.full_title || c.metadata?.article_title || c.metadata?.archive_title,
              }))
            ),
          },
        ],
        numPredict: RELEVANCE_CHECK_MAX_TOKENS,
        temperature: 0,
        think: false,
        thinkingCapable,
        format: ON_TOPIC_SCHEMA,
      })

      const verdict = resolveStructured(
        response.message.content.trim(),
        pickOnTopic,
        response.structured === true
      )
      if (!verdict.ok) {
        logger.warn(
          `[RAG] Relevance check on "${model}" returned no usable verdict (${verdict.reason}); keeping all chunks`
        )
        return unjudged()
      }

      const ms = Date.now() - started
      logger.debug(
        `[RAG] Relevance check on "${model}": ${verdict.value ? 'on topic' : 'off topic'} (${chunks.length} chunk(s), ${ms}ms)`
      )
      return verdict.value
        ? { kept: chunks, rejected: 0, judged: true, ms }
        : { kept: [], rejected: chunks.length, judged: true, ms }
    } catch (error) {
      logger.warn(
        `[RAG] Relevance check on "${model}" failed, keeping all chunks: ${error instanceof Error ? error.message : error}`
      )
      return unjudged()
    }
  }
}
