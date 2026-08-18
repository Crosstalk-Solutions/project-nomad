import { EvalCorpusService } from '#services/eval_corpus_service'
import { OllamaService, type NomadChatUsage } from '#services/ollama_service'
import { RagPipelineService } from '#services/rag_pipeline_service'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import { KB_EVAL_COLLECTION } from '../../constants/kb_collections.js'
import type { OllamaChatMessage } from '../../types/ollama.js'
import type { PipelineOptions, RetrievedChunk } from '../../types/rag.js'
import { docIdFromSource } from '../utils/eval/corpus_source.js'
import type { Golden } from '../utils/eval/golden_set.js'
import {
  scoreAnswer,
  summarizeNumeric,
  summarizeRepeats,
  type GenerationScores,
  type NumericSummary,
  type RepeatStats,
} from '../utils/eval/generation_metrics.js'

/**
 * The three ways to run a question, and what each one isolates.
 *
 * This is the part of the harness that answers "code bug or weak model?".
 * Running the same question all three ways turns one ambiguous score into a
 * decomposition:
 *
 * - `oracle` gives the model perfect context by construction. A low score here
 *   is the model (or the prompt) failing to use good context — retrieval is
 *   provably not at fault.
 * - `e2e` is the real product. `oracle - e2e` is the cost of imperfect retrieval.
 * - `noretrieval` is the model's parametric baseline. `e2e - noretrieval` is
 *   what RAG is actually buying, and on the fictional questions it should be
 *   nearly everything, since no model can know them.
 */
export type GenerationMode = 'oracle' | 'e2e' | 'noretrieval'

/**
 * Sentinel model name for the extractive reference run.
 *
 * `--model=mock` needs no Ollama at all: it answers by echoing whatever context
 * the pipeline injected, and refuses when nothing was injected. That makes it
 * two useful things at once — a way to exercise scoring and reporting with zero
 * models installed (so the harness itself is CI-testable), and a genuine
 * *ceiling* line: the best a perfectly extractive model could score given this
 * retrieval. A real model below the mock line is the bottleneck; a mock line
 * that is itself low means retrieval is.
 */
export const MOCK_MODEL = 'mock'

/** Fixed sampling for eval runs. Never used by production chat. */
export const EVAL_TEMPERATURE = 0
export const EVAL_SEED = 42

export type GenerationRunOptions = {
  mode: GenerationMode
  model: string
  repeats?: number
  topK?: number
  scoreThreshold?: number
  /** Skip the history-aware rewrite even on multi-turn goldens. */
  skipQueryRewrite?: boolean
  onProgress?: (id: string, index: number, total: number) => void
}

export type GenerationCaseResult = {
  id: string
  tags: string[]
  expectRefusal: boolean
  /** One entry per repeat. */
  answers: string[]
  scores: GenerationScores[]
  correctness: RepeatStats
  refusalCorrectness: RepeatStats
  leakageFree: RepeatStats
  groundedness: NumericSummary | null
  retrievedDocIds: string[]
  injectedChunks: number
  /**
   * What the budget planner did with the window on this case.
   *
   * Without this a low score is ambiguous: it could mean the model answered
   * badly, or it could mean the model never saw the material because the
   * relevant turns were evicted. These fields tell the two apart.
   */
  budget?: {
    contextWindow: number
    estimatedPromptTokens: number
    promptBudget: number
    turnsDropped: number
    chunksDropped: number
    historyElided: boolean
    queryTruncated: boolean
  }
  /**
   * Estimated vs. the backend's real prompt token count. The estimator is the
   * foundation every budget decision rests on, so its error is worth gating on.
   */
  promptTokenError?: number
  /** Non-null only when something went wrong talking to the model. */
  error?: string
}

export type GenerationAggregate = {
  cases: number
  /** Cases whose pass/fail flipped across repeats; excluded from gating. */
  unstable: number
  errors: number
  correctness: number | null
  refusalCorrectness: number | null
  leakageRate: number | null
  thinkTagLeakRate: number | null
  markdownRate: number | null
  groundedness: NumericSummary | null
  meanAnswerLength: number | null
  /** Share of cases where history had to be trimmed to fit the window. */
  historyElidedRate: number | null
  /** Share of cases where a retrieved chunk didn't fit the context budget. */
  chunksDroppedRate: number | null
  /** Mean absolute error of the token estimator against real prompt counts. */
  promptTokenError: NumericSummary | null
  meanPromptTokens: number | null
}

export type GenerationRunResult = {
  params: {
    mode: GenerationMode
    model: string
    repeats: number
    temperature: number
    seed: number
    topK?: number
    scoreThreshold?: number
  }
  overall: GenerationAggregate
  byTag: Record<string, GenerationAggregate>
  cases: GenerationCaseResult[]
  elapsedMs: number
}

@inject()
export class EvalGenerationService {
  constructor(
    private ollamaService: OllamaService,
    private pipeline: RagPipelineService,
    private corpusService: EvalCorpusService
  ) {}

  async run(goldens: Golden[], options: GenerationRunOptions): Promise<GenerationRunResult> {
    const repeats = Math.max(1, options.repeats ?? 3)
    const started = Date.now()
    const isMock = options.model === MOCK_MODEL

    // Oracle mode needs the corpus text on hand to synthesize perfect context.
    const corpusText = options.mode === 'oracle' ? await this.loadCorpusText() : null

    if (!isMock) await this.prepareModel(options.model)

    const cases: GenerationCaseResult[] = []
    for (const [index, golden] of goldens.entries()) {
      options.onProgress?.(golden.id, index + 1, goldens.length)
      cases.push(await this.runCase(golden, options, repeats, corpusText, isMock))
    }

    return {
      params: {
        mode: options.mode,
        model: options.model,
        repeats,
        temperature: EVAL_TEMPERATURE,
        seed: EVAL_SEED,
        topK: options.topK,
        scoreThreshold: options.scoreThreshold,
      },
      overall: aggregateGeneration(cases),
      byTag: aggregateGenerationByTag(cases),
      cases,
      elapsedMs: Date.now() - started,
    }
  }

  /**
   * Evict other resident models and burn one throwaway generation.
   *
   * Both borrowed from BenchmarkService, and for the same reasons it added
   * them: a cold first run is dramatically slower and behaves differently, and
   * leftover models in VRAM change how the one under test is scheduled. Quality
   * runs are less timing-sensitive than throughput runs, but a first-token
   * timeout or an OOM-driven CPU fallback absolutely does change the answer.
   */
  private async prepareModel(model: string): Promise<void> {
    try {
      await this.ollamaService.unloadAllChatModelsExcept(model)
    } catch (error) {
      logger.warn(`[Eval] Could not evict resident models: ${errorText(error)}`)
    }
    try {
      await this.ollamaService.chat({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        temperature: EVAL_TEMPERATURE,
        seed: EVAL_SEED,
      })
    } catch (error) {
      // Best-effort: if warm-up fails the scored runs will surface the real
      // problem with a better message than we could produce here.
      logger.warn(`[Eval] Warm-up generation failed: ${errorText(error)}`)
    }
  }

  private async loadCorpusText(): Promise<Map<string, { text: string; path: string }>> {
    const docs = await this.corpusService.loadCorpus()
    return new Map(docs.map((d) => [d.docId, { text: d.text, path: d.path }]))
  }

  private async runCase(
    golden: Golden,
    options: GenerationRunOptions,
    repeats: number,
    corpusText: Map<string, { text: string; path: string }> | null,
    isMock: boolean
  ): Promise<GenerationCaseResult> {
    const messages: OllamaChatMessage[] = [
      ...golden.turns.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: golden.query },
    ]

    const pipelineOptions: PipelineOptions = {
      collection: KB_EVAL_COLLECTION,
      topK: options.topK,
      scoreThreshold: options.scoreThreshold,
      // The mock run must not touch Ollama at all — that is what makes it
      // usable with no models installed. The rewrite is a chat-model call, so
      // it is always skipped there (it would 404 and silently fall back, which
      // works but quietly makes the "no model needed" claim untrue).
      skipQueryRewrite: options.skipQueryRewrite || isMock,
      // A developer's personal NOMAD.md would silently skew every score.
      skipNomadMd: true,
    }

    if (options.mode === 'oracle') {
      pipelineOptions.oracleContext = golden.relevantDocIds.map((docId) => {
        const doc = corpusText?.get(docId)
        return {
          text: doc?.text ?? '',
          score: 1,
          metadata: { source: doc?.path },
        } satisfies RetrievedChunk
      })
    } else if (options.mode === 'noretrieval') {
      // An empty oracle context short-circuits retrieval without injecting
      // anything — the model answers from parametric memory alone.
      pipelineOptions.oracleContext = []
    }

    const answers: string[] = []
    const scores: GenerationScores[] = []
    let retrievedDocIds: string[] = []
    let injectedChunks = 0
    let budget: GenerationCaseResult['budget']
    let promptTokenError: number | undefined
    let error: string | undefined

    for (let attempt = 0; attempt < repeats; attempt++) {
      try {
        const trace = await this.pipeline.buildPrompt(messages, options.model, pipelineOptions)
        retrievedDocIds = uniqueDocIds(trace.retrieved)
        injectedChunks = trace.injected.length
        const context = trace.injected.map((c) => c.text).join('\n\n')
        if (trace.budget) {
          budget = {
            contextWindow: trace.budget.contextWindow,
            estimatedPromptTokens: trace.budget.estimatedPromptTokens,
            promptBudget: trace.budget.promptBudget,
            turnsDropped: trace.budget.turnsDropped,
            chunksDropped: trace.budget.chunksDropped,
            historyElided: trace.budget.historyElided,
            queryTruncated: trace.budget.queryTruncated,
          }
        }

        const generated = isMock
          ? { answer: mockAnswer(context), usage: undefined }
          : await this.generate(options.model, trace.messages, trace.numCtx, trace.numPredict)
        const answer = generated.answer

        // The backend just reported the prompt's real token count. Comparing it
        // to the estimate is the only way to know whether the budget above was
        // built on a number worth trusting.
        if (generated.usage?.promptTokens && trace.uncalibratedPromptTokens) {
          promptTokenError =
            Math.abs(generated.usage.promptTokens - trace.uncalibratedPromptTokens) /
            generated.usage.promptTokens
        }

        answers.push(answer)
        scores.push(
          scoreAnswer({
            answer,
            context,
            mustInclude: golden.mustInclude,
            mustNotInclude: golden.mustNotInclude,
            expectRefusal: golden.expectRefusal,
          })
        )
      } catch (err) {
        error = errorText(err)
        break
      }
    }

    return {
      id: golden.id,
      tags: golden.tags,
      expectRefusal: golden.expectRefusal,
      answers,
      scores,
      correctness: summarizeRepeats(scores.map((s) => s.correct)),
      refusalCorrectness: summarizeRepeats(scores.map((s) => s.refusalCorrect)),
      leakageFree: summarizeRepeats(scores.map((s) => s.leakage.length === 0)),
      groundedness: summarizeNumeric(scores.map((s) => s.numericGroundedness)),
      retrievedDocIds,
      injectedChunks,
      budget,
      promptTokenError,
      error,
    }
  }

  private async generate(
    model: string,
    messages: OllamaChatMessage[],
    numCtx?: number,
    numPredict?: number
  ): Promise<{ answer: string; usage?: NomadChatUsage }> {
    const response = await this.ollamaService.chat({
      model,
      messages,
      numCtx,
      numPredict,
      temperature: EVAL_TEMPERATURE,
      seed: EVAL_SEED,
    })
    return { answer: response.message.content.trim(), usage: response.usage }
  }
}

/**
 * The extractive reference answer: echo the context, or decline when there is
 * none. Deterministic, model-free, and an honest ceiling for the current
 * retrieval.
 */
export function mockAnswer(context: string): string {
  if (!context.trim()) return "I don't have information about that."
  return context
}

function uniqueDocIds(chunks: RetrievedChunk[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const chunk of chunks) {
    const docId = docIdFromSource(chunk.metadata?.source)
    if (docId && !seen.has(docId)) {
      seen.add(docId)
      ids.push(docId)
    }
  }
  return ids
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const rate = (values: boolean[]): number | null =>
  values.length === 0 ? null : values.filter(Boolean).length / values.length

export function aggregateGeneration(cases: GenerationCaseResult[]): GenerationAggregate {
  const scored = cases.filter((c) => c.scores.length > 0)
  const allScores = scored.flatMap((c) => c.scores)

  return {
    cases: cases.length,
    unstable: scored.filter((c) => c.correctness.unstable).length,
    errors: cases.filter((c) => c.error).length,
    // Mean pass-rate rather than all-or-nothing, so a case that passes 2 of 3
    // is reported as 0.67 instead of being silently rounded either way.
    correctness: scored.length === 0 ? null : mean(scored.map((c) => c.correctness.passRate)),
    refusalCorrectness:
      scored.length === 0 ? null : mean(scored.map((c) => c.refusalCorrectness.passRate)),
    leakageRate: rate(allScores.map((s) => s.leakage.length > 0)),
    thinkTagLeakRate: rate(allScores.map((s) => s.thinkTagLeak)),
    markdownRate: rate(allScores.map((s) => s.markdownFormatted)),
    groundedness: summarizeNumeric(allScores.map((s) => s.numericGroundedness)),
    meanAnswerLength: allScores.length === 0 ? null : mean(allScores.map((s) => s.length)),
    historyElidedRate: rate(cases.filter((c) => c.budget).map((c) => c.budget!.historyElided)),
    chunksDroppedRate: rate(cases.filter((c) => c.budget).map((c) => c.budget!.chunksDropped > 0)),
    promptTokenError: summarizeNumeric(
      cases.map((c) => c.promptTokenError).filter((e): e is number => e !== undefined)
    ),
    meanPromptTokens: (() => {
      const values = cases
        .map((c) => c.budget?.estimatedPromptTokens)
        .filter((v): v is number => v !== undefined)
      return values.length === 0 ? null : mean(values)
    })(),
  }
}

export function aggregateGenerationByTag(
  cases: GenerationCaseResult[]
): Record<string, GenerationAggregate> {
  const tags = new Set(cases.flatMap((c) => c.tags))
  const out: Record<string, GenerationAggregate> = {}
  for (const tag of [...tags].sort()) {
    out[tag] = aggregateGeneration(cases.filter((c) => c.tags.includes(tag)))
  }
  return out
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
