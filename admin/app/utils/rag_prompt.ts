/**
 * Pure prompt-budgeting helpers for the chat RAG pipeline.
 *
 * These live here rather than in RagPipelineService so they can be exercised
 * under bare `node --experimental-strip-types` with no MySQL, Redis, Qdrant, or
 * Ollama — the same reason `kb_ratio_lookup.ts` is shaped this way. The service
 * supplies the config; everything below is a function of its arguments.
 */

/**
 * Chars-per-token estimate used when budgeting the *prompt* (context trimming
 * and the num_ctx ladder).
 *
 * NOTE: RagService.CHAR_TO_TOKEN_RATIO is 2, not 3.5 — the two halves of the
 * system disagree about what a token costs, and RagService's own doc-comment
 * says 3. That divergence is real and known; reconciling it changes chunk size
 * and therefore retrieval results, so it is deliberately left alone here and
 * tracked as its own measured change rather than folded into a refactor.
 */
export const PROMPT_CHARS_PER_TOKEN = 3.5

/**
 * num_ctx is only requested once the system prompt is large enough to risk
 * overflowing Ollama's silent 2048 default. Below the trigger we send nothing
 * and inherit the server default.
 */
export const NUM_CTX_TRIGGER_TOKENS = 3000
export const NUM_CTX_RESPONSE_HEADROOM = 2048
export const NUM_CTX_LADDER = [8192, 16384, 32768, 65536]

export type ContextLimits = { maxResults: number; maxTokens: number }
export type ContextLimitTier = { maxParams: number; maxResults: number; maxTokens: number }

/** The minimum shape these helpers need; the real chunks carry more. */
export type BudgetableChunk = { text: string; metadata?: Record<string, any> }
export type BudgetableMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Determine RAG context limits from the model size encoded in its name.
 * Parses size indicators like "1b", "3b", "8b", "70b".
 *
 * PRESERVED QUIRK: an unparseable model name is treated as 8B. That is a guess,
 * and for a name like "phi3" or a custom tag it can hand a small model far more
 * context than it can actually use. Faithful to the pre-extraction behaviour.
 */
export function getContextLimitsForModel(
  modelName: string,
  tiers: readonly ContextLimitTier[]
): ContextLimits {
  // e.g. "llama3.2:3b", "qwen2.5:1.5b", "gemma:7b"
  const sizeMatch = modelName.match(/(\d+\.?\d*)[bB]/)
  const paramBillions = sizeMatch ? Number.parseFloat(sizeMatch[1]) : 8 // default to 8B if unknown

  for (const tier of tiers) {
    if (paramBillions <= tier.maxParams) {
      return { maxResults: tier.maxResults, maxTokens: tier.maxTokens }
    }
  }

  return { maxResults: 5, maxTokens: 0 }
}

/**
 * Apply the model-size context budget: cap the result count, then cap total
 * characters.
 *
 * The first (most relevant) result is always kept — the token cap only gates
 * subsequent results, so a single oversized chunk never starves the model of
 * context entirely.
 */
export function trimToContextBudget<T extends BudgetableChunk>(
  docs: T[],
  limits: ContextLimits
): T[] {
  const byCount = docs.slice(0, limits.maxResults)
  if (limits.maxTokens <= 0) return byCount

  const charCap = limits.maxTokens * PROMPT_CHARS_PER_TOKEN
  let totalChars = 0
  return byCount.filter((doc, idx) => {
    totalChars += doc.text.length
    return idx === 0 || totalChars <= charCap
  })
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
      const title = doc.metadata?.full_title || doc.metadata?.article_title
      const label = title ? `[Context ${idx + 1} — ${title}]` : `[Context ${idx + 1}]`
      return `${label}\n${doc.text}`
    })
    .join('\n\n')
}

/**
 * Request a context window big enough to hold the system messages, but only
 * once they are large enough to be at risk.
 *
 * Ollama respects num_ctx per request; LM Studio ignores it gracefully. Below
 * the trigger we send nothing and inherit the server default — which for Ollama
 * is a silent 2048.
 */
export function deriveNumCtx(messages: BudgetableMessage[]): number | undefined {
  const systemChars = messages
    .filter((m) => m.role === 'system')
    .reduce((sum, m) => sum + m.content.length, 0)
  const estimatedSystemTokens = Math.ceil(systemChars / PROMPT_CHARS_PER_TOKEN)

  if (estimatedSystemTokens <= NUM_CTX_TRIGGER_TOKENS) return undefined

  const needed = estimatedSystemTokens + NUM_CTX_RESPONSE_HEADROOM
  return NUM_CTX_LADDER.find((n) => n >= needed) ?? NUM_CTX_LADDER[NUM_CTX_LADDER.length - 1]
}
