/**
 * Pure helpers for shaping the retrieved-context block.
 *
 * These live here rather than in RagPipelineService so they can be exercised
 * under bare `node --experimental-strip-types` with no MySQL, Redis, Qdrant, or
 * Ollama — the same reason `kb_ratio_lookup.ts` is shaped this way. The service
 * supplies the config; everything below is a function of its arguments.
 *
 * Token budgeting used to live here too, as a chars-per-token estimate feeding a
 * `num_ctx` ladder. Both are gone: the estimate now comes from
 * `token_estimate.ts` (calibrated against real token counts) and the allocation
 * from `context_budget.ts`. The ladder in particular was dead code — it fed a
 * `num_ctx` that the OpenAI-compatible endpoint silently discarded, so no chat
 * ever ran at the window it computed.
 */

import { parseParameterBillions } from './context_window.js'
import type { ChatSource } from '../../types/chat.js'

export type ContextLimits = { maxResults: number; maxTokens: number }
export type ContextLimitTier = { maxParams: number; maxResults: number; maxTokens: number }

/** The minimum shape these helpers need; the real chunks carry more. */
export type BudgetableChunk = { text: string; metadata?: Record<string, any> }
export type BudgetableMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Determine RAG context limits from the model's parameter count.
 *
 * `parameterSize` is Ollama's own `details.parameter_size` ("8.0B") and is the
 * honest source. The model name is only a fallback: it used to be the *only*
 * source, which meant a tag carrying no size — "phi3", "mistral-nemo", anything
 * custom — was silently assumed to be 8B and handed far more context than a
 * small model can actually use. When neither source knows, 8B remains the
 * assumption, but now it is one made explicitly rather than by a failed regex.
 */
export function getContextLimitsForModel(
  modelName: string,
  tiers: readonly ContextLimitTier[],
  parameterSize?: string
): ContextLimits {
  const paramBillions = parseParameterBillions(parameterSize, modelName) ?? 8

  for (const tier of tiers) {
    if (paramBillions <= tier.maxParams) {
      return { maxResults: tier.maxResults, maxTokens: tier.maxTokens }
    }
  }

  return { maxResults: 5, maxTokens: 0 }
}

/**
 * Render retrieved chunks into the block the rag_context prompt wraps.
 *
 * Each block is labelled with its source title when one is available — a
 * neutral, honest provenance signal — but never with the raw relevance score.
 * nomic cosine scores for genuinely relevant passages sit around 0.4-0.6, and
 * surfacing e.g. "42%" primes the model to distrust correct context. Scores
 * stay in the logs and in the eval report.
 */
export function buildContextBlock(docs: BudgetableChunk[]): string {
  return docs
    .map((doc, idx) => {
      const title =
        doc.metadata?.archive_title || doc.metadata?.full_title || doc.metadata?.article_title
      const date = doc.metadata?.archive_date
      const label = title
        ? `[Context ${idx + 1} — ${title}${date ? ` (${date})` : ''}]`
        : `[Context ${idx + 1}]`
      return `${label}\n${doc.text}`
    })
    .join('\n\n')
}

/**
 * Build the deduplicated "Sources" list shown under an assistant answer.
 *
 * Deliberately fed from what was *injected* into the prompt rather than from
 * everything retrieval returned: a chunk dropped by the budget planner never
 * reached the model, so citing it would credit the answer to a document it was
 * not based on -- the exact failure the citation list exists to prevent.
 *
 * Dedupes on the originating path so a dozen chunks out of one archive collapse
 * to one entry, falling back to the title when a point carries no path. Points
 * with neither are skipped rather than shown as "Unknown source": an entry the
 * user cannot act on is worse than one fewer entry.
 */
export function buildCitations(docs: BudgetableChunk[]): ChatSource[] {
  const seen = new Set<string>()
  const sources: ChatSource[] = []

  for (const doc of docs) {
    const title =
      doc.metadata?.archive_title || doc.metadata?.full_title || doc.metadata?.article_title
    const path = doc.metadata?.source as string | undefined
    const key = path || title
    if (!key || seen.has(key)) continue
    seen.add(key)

    sources.push({
      // A user-uploaded PDF carries no embedded title, so fall back to its
      // filename -- which is what the user named it and will recognise.
      title: title || path!.split('/').pop() || path!,
      date: doc.metadata?.archive_date,
      source: path,
    })
  }

  return sources
}
