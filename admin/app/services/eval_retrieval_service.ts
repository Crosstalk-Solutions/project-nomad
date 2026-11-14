import { EvalCorpusService } from '#services/eval_corpus_service'
import { RagService } from '#services/rag_service'
import { RelevanceJudgeService } from '#services/relevance_judge_service'
import { inject } from '@adonisjs/core'
import { KB_EVAL_COLLECTION } from '../../constants/kb_collections.js'
import { RAG_DEFAULT_SCORE_THRESHOLD, RAG_DEFAULT_TOP_K } from '../../constants/ollama.js'
import { resolveDefaultMinFinalScore } from '../utils/rag_relevance.js'
import type { RetrievalStages } from '../../types/rag.js'
import { docIdFromSource } from '../utils/eval/corpus_source.js'
import type { Golden } from '../utils/eval/golden_set.js'
import {
  aggregate,
  aggregateByTag,
  DEFAULT_K_VALUES,
  scoreCase,
  type RetrievalAggregate,
  type RetrievalCase,
  type RetrievalCaseResult,
  type ScoredChunk,
} from '../utils/eval/retrieval_metrics.js'

export type RetrievalRunOptions = {
  topK?: number
  scoreThreshold?: number
  /** Post-rerank relevance floor. Defaults to the constant, never to the setting. */
  minFinalScore?: number
  kValues?: number[]
  /** Score the raw dense / reranked / diversified orderings separately. */
  ablate?: boolean
  /** Also return every golden's full pre-floor candidate pool (see RetrievalStages.candidates). */
  dump?: boolean
  /**
   * Run the relevance check on this model after the floor, as chat does when it
   * is enabled. Unset keeps this tier model-free and deterministic.
   */
  judgeModel?: string
}

/** What the relevance check cost and did, when `judgeModel` was set. */
export type JudgeStats = {
  model: string
  calls: number
  /** Calls that failed open (timeout, error, unusable verdict). */
  failures: number
  rejected: number
  meanMs: number
  maxMs: number
}

/** One golden's full candidate pool, for simulating a relevance gate offline. */
export type CandidatePool = {
  id: string
  tags: string[]
  expectRefusal: boolean
  relevantDocIds: string[]
  candidates: Array<{ docId: string | null; score: number; semanticScore: number | null }>
}

export type StageAblation = {
  dense: RetrievalAggregate
  reranked: RetrievalAggregate
  diversified: RetrievalAggregate
}

export type RetrievalRunResult = {
  params: { topK: number; scoreThreshold: number; minFinalScore: number; kValues: number[] }
  overall: RetrievalAggregate
  byTag: Record<string, RetrievalAggregate>
  cases: RetrievalCaseResult[]
  ablation: StageAblation | null
  /**
   * Chunks that came back without a resolvable eval doc id. Non-zero means the
   * collection filter leaked and the run is measuring the wrong corpus.
   */
  unresolvedChunks: number
  /** Every golden's candidate pool, when `dump` was requested. */
  pools: CandidatePool[] | null
  judge: JudgeStats | null
}

/**
 * Runs the golden question set through NOMAD's real retrieval path and scores
 * the result.
 *
 * Deliberately does not touch the chat model. The only model call is the
 * embedding of each query, whose output is stable, so two runs over the same
 * corpus produce identical numbers on any hardware. That is what makes this the
 * fast inner loop and the only tier worth gating CI on: a movement here is a
 * code change, full stop.
 *
 * Multi-turn goldens are scored on their raw final message. Resolving the
 * coreference would need the chat model, which would make this tier
 * non-deterministic — so the multi-turn bucket here reports the honest floor,
 * and the rewrite's contribution is measured in the generation tier instead.
 */
@inject()
export class EvalRetrievalService {
  constructor(
    private ragService: RagService,
    private corpusService: EvalCorpusService,
    private judgeService: RelevanceJudgeService
  ) {}

  async run(goldens: Golden[], options: RetrievalRunOptions = {}): Promise<RetrievalRunResult> {
    const topK = options.topK ?? RAG_DEFAULT_TOP_K
    const scoreThreshold = options.scoreThreshold ?? RAG_DEFAULT_SCORE_THRESHOLD
    // The embedding model's default floor, deliberately — NOT resolveMinFinalScore().
    // The chat path reads the user's `rag.minRelevance` setting; this tier must not,
    // or a slider position on one developer's machine would silently move the
    // numbers and the committed baseline would stop being reproducible anywhere
    // else. Same reasoning as the harness omitting `skipRetrieval`.
    const minFinalScore = options.minFinalScore ?? (await resolveDefaultMinFinalScore())
    const kValues = options.kValues ?? DEFAULT_K_VALUES

    const cases: RetrievalCase[] = []
    const denseCases: RetrievalCase[] = []
    const rerankedCases: RetrievalCase[] = []
    const diversifiedCases: RetrievalCase[] = []
    const pools: CandidatePool[] = []
    const recordStages = options.ablate || options.dump
    const judgeMs: number[] = []
    let judgeFailures = 0
    let judgeRejected = 0
    let unresolvedChunks = 0

    for (const golden of goldens) {
      const stages: RetrievalStages = {}
      let docs = await this.ragService.searchSimilarDocuments(
        golden.query,
        topK,
        scoreThreshold,
        KB_EVAL_COLLECTION,
        recordStages ? stages : undefined,
        minFinalScore
      )

      if (options.judgeModel && docs.length > 0) {
        const verdict = await this.judgeService.judge(golden.query, docs, options.judgeModel)
        judgeMs.push(verdict.ms)
        if (!verdict.judged) judgeFailures++
        judgeRejected += verdict.rejected
        docs = verdict.kept
      }

      const retrieved: ScoredChunk[] = docs.map((d) => {
        const docId = docIdFromSource(d.metadata?.source)
        if (!docId) unresolvedChunks++
        return { docId, score: d.score, semanticScore: d.metadata?.semantic_score }
      })

      cases.push(toCase(golden, retrieved))

      if (options.dump) {
        pools.push({
          id: golden.id,
          tags: golden.tags,
          expectRefusal: golden.expectRefusal,
          relevantDocIds: golden.relevantDocIds,
          candidates: (stages.candidates ?? []).map((c) => ({
            docId: docIdFromSource(c.source),
            score: c.score,
            semanticScore: c.semanticScore ?? null,
          })),
        })
      }

      if (options.ablate) {
        denseCases.push(toCase(golden, stageToChunks(stages.dense)))
        rerankedCases.push(toCase(golden, stageToChunks(stages.reranked)))
        diversifiedCases.push(toCase(golden, stageToChunks(stages.diversified)))
      }
    }

    const results = cases.map((c) => scoreCase(c, kValues))

    const aggregateStage = (stageCases: RetrievalCase[]) =>
      aggregate(stageCases, stageCases.map((c) => scoreCase(c, kValues)), kValues)

    return {
      params: { topK, scoreThreshold, minFinalScore, kValues },
      overall: aggregate(cases, results, kValues),
      byTag: aggregateByTag(cases, results, kValues),
      cases: results,
      ablation: options.ablate
        ? {
            dense: aggregateStage(denseCases),
            reranked: aggregateStage(rerankedCases),
            diversified: aggregateStage(diversifiedCases),
          }
        : null,
      unresolvedChunks,
      pools: options.dump ? pools : null,
      judge: options.judgeModel
        ? {
            model: options.judgeModel,
            calls: judgeMs.length,
            failures: judgeFailures,
            rejected: judgeRejected,
            meanMs: judgeMs.length ? judgeMs.reduce((a, b) => a + b, 0) / judgeMs.length : 0,
            maxMs: judgeMs.length ? Math.max(...judgeMs) : 0,
          }
        : null,
    }
  }

  /** Confirm the corpus is actually ingested before reporting a score of zero. */
  async assertCorpusReady(): Promise<number> {
    const chunks = await this.corpusService.count()
    if (chunks === 0) {
      throw new Error(
        'The eval corpus is not ingested — every score would be zero. Run: node ace eval:corpus --ingest'
      )
    }
    return chunks
  }
}

function toCase(golden: Golden, retrieved: ScoredChunk[]): RetrievalCase {
  return {
    id: golden.id,
    tags: golden.tags,
    retrieved,
    relevantDocIds: golden.relevantDocIds,
    expectRefusal: golden.expectRefusal,
  }
}

function stageToChunks(stage: Array<{ source?: string; score: number }> | undefined): ScoredChunk[] {
  return (stage ?? []).map((entry) => ({
    docId: docIdFromSource(entry.source),
    score: entry.score,
  }))
}
