import { EvalCorpusService } from '#services/eval_corpus_service'
import { RagService } from '#services/rag_service'
import { inject } from '@adonisjs/core'
import { KB_EVAL_COLLECTION } from '../../constants/kb_collections.js'
import {
  RAG_DEFAULT_SCORE_THRESHOLD,
  RAG_DEFAULT_TOP_K,
  RAG_MIN_FINAL_SCORE,
} from '../../constants/ollama.js'
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
    private corpusService: EvalCorpusService
  ) {}

  async run(goldens: Golden[], options: RetrievalRunOptions = {}): Promise<RetrievalRunResult> {
    const topK = options.topK ?? RAG_DEFAULT_TOP_K
    const scoreThreshold = options.scoreThreshold ?? RAG_DEFAULT_SCORE_THRESHOLD
    // RAG_MIN_FINAL_SCORE, deliberately — NOT resolveMinFinalScore(). The chat
    // path reads the user's `rag.minRelevance` setting; this tier must not, or a
    // slider position on one developer's machine would silently move the numbers
    // and the committed baseline would stop being reproducible anywhere else.
    // Same reasoning as the harness omitting `skipRetrieval`.
    const minFinalScore = options.minFinalScore ?? RAG_MIN_FINAL_SCORE
    const kValues = options.kValues ?? DEFAULT_K_VALUES

    const cases: RetrievalCase[] = []
    const denseCases: RetrievalCase[] = []
    const rerankedCases: RetrievalCase[] = []
    const diversifiedCases: RetrievalCase[] = []
    let unresolvedChunks = 0

    for (const golden of goldens) {
      const stages: RetrievalStages = {}
      const docs = await this.ragService.searchSimilarDocuments(
        golden.query,
        topK,
        scoreThreshold,
        KB_EVAL_COLLECTION,
        options.ablate ? stages : undefined,
        minFinalScore
      )

      const retrieved: ScoredChunk[] = docs.map((d) => {
        const docId = docIdFromSource(d.metadata?.source)
        if (!docId) unresolvedChunks++
        return { docId, score: d.score, semanticScore: d.metadata?.semantic_score }
      })

      cases.push(toCase(golden, retrieved))

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
