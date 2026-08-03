import type { OllamaChatMessage } from './ollama.js'
import type { BudgetTrace, RagPlacement } from '../app/utils/context_budget.js'

export type EmbedJobWithProgress = {
  jobId: string
  fileName: string
  filePath: string
  progress: number
  status: string
  error?: string
  /** ms epoch of last completed batch; multi-batch ZIMs update this each batch. */
  lastBatchAt?: number
  /** ms epoch of first batch start; used as a fallback when lastBatchAt unset. */
  startedAt?: number
  /** Total chunks embedded across this job's batches so far. */
  chunks?: number
}

export type ProcessAndEmbedFileResponse = {
  success: boolean
  message: string
  chunks?: number
  hasMoreBatches?: boolean
  articlesProcessed?: number
  totalArticles?: number
}
export type ProcessZIMFileResponse = ProcessAndEmbedFileResponse

export type RAGResult = {
  text: string
  score: number
  keywords: string
  chunk_index: number
  created_at: number
  article_title?: string
  section_title?: string
  full_title?: string
  hierarchy?: string
  document_id?: string
  content_type?: string
  source?: string
}

export type RerankedRAGResult = Omit<RAGResult, 'keywords'> & {
  finalScore: number
}

/** One entry in a recorded retrieval stage: just enough to score a ranking. */
export type StageEntry = { source?: string; score: number }

/**
 * The three ranked lists retrieval produces internally, captured so the eval
 * harness can score each stage separately and show whether the heuristic
 * reranker and the source-diversity penalty are earning their complexity.
 *
 * `dense` is the raw cosine ordering from Qdrant, `reranked` adds the
 * keyword/heading boosts, `diversified` adds the same-document penalty.
 */
export type RetrievalStages = {
  dense?: StageEntry[]
  reranked?: StageEntry[]
  diversified?: StageEntry[]
}

/**
 * Counts from the relevance floor, for callers that want to say *why* nothing
 * came back. Written whether or not stage ablation is on — it is two integers,
 * and "we searched and found nothing relevant enough" is worth being able to
 * say out loud.
 */
export type RetrievalFloorStats = {
  /** Candidates the floor was applied to (post-rerank, pre-diversity). */
  candidates: number
  /** How many of those fell below it. */
  belowFloor: number
}

/**
 * A chunk as returned by `RagService.searchSimilarDocuments` — the shape the
 * chat pipeline consumes and the eval harness scores.
 */
export type RetrievedChunk = {
  text: string
  score: number
  metadata?: Record<string, any>
}

/**
 * Knobs on a single pipeline run. Everything is optional: the defaults
 * reproduce production chat exactly. The non-default paths exist so the eval
 * harness can ablate one stage at a time without a parallel implementation.
 */
export type PipelineOptions = {
  topK?: number
  scoreThreshold?: number
  collection?: string
  /** Skip the history-aware rewrite (which is an LLM call, and therefore
   *  non-deterministic). Retrieval then runs on the raw last user message. */
  skipQueryRewrite?: boolean
  /** Bypass retrieval entirely and inject these chunks as the context. Used by
   *  the `oracle` eval mode to isolate generation quality from retrieval. */
  oracleContext?: RetrievedChunk[]
  /** Ignore the user's NOMAD.md. Off in production; on in evals, where a
   *  developer's personal instructions would silently skew every result. */
  skipNomadMd?: boolean
  /** Skip the entire retrieval pipeline — the hasDocuments check, the
   *  query-rewrite LLM call and the Qdrant search — leaving the prompt with
   *  system prompts only. Set from the `rag.enabled` KV setting. Opt-out by
   *  design: the eval harness omits it and therefore always retrieves. */
  skipRetrieval?: boolean
  /** Override where the retrieved-context block sits. Defaults to RAG_PLACEMENT;
   *  the eval harness sets it explicitly to compare the two orderings. */
  ragPlacement?: RagPlacement
  /** Post-rerank relevance floor. Unset resolves the user's `rag.minRelevance`
   *  setting; the eval harness passes an explicit value so its numbers cannot
   *  depend on how one machine's slider happens to be set. */
  minFinalScore?: number
}

/**
 * Everything the pipeline decided on the way to a prompt. The controller uses
 * only `messages` and `numCtx`; the eval harness scores the rest. Returning it
 * unconditionally keeps one code path for both.
 */
export type PipelineTrace = {
  /** null when retrieval was skipped entirely (empty KB, or no user message). */
  rewrittenQuery: string | null
  /** True when the rewrite LLM call actually ran (it is skipped on turn 1). */
  didRewrite: boolean
  /** Everything retrieval returned, pre-trim. */
  retrieved: RetrievedChunk[]
  /** What actually made it into the prompt, post model-size trim. */
  injected: RetrievedChunk[]
  /** The exact payload handed to Ollama. */
  messages: OllamaChatMessage[]
  numCtx: number | undefined
  /** Generation cap, so the answer cannot run past the end of the window. */
  numPredict: number | undefined
  contextLimits: { maxResults: number; maxTokens: number }
  timings: { rewriteMs: number; retrievalMs: number }
  /**
   * The relevance floor this turn was retrieved under, and how many candidates
   * fell below it. `chunksBelowFloor > 0` with `retrieved.length === 0` is the
   * "we searched and nothing was relevant enough" case — which is the honest
   * thing to tell the user, and the data the retrieval-status UX needs to say it.
   */
  minFinalScore: number
  chunksBelowFloor: number
  /**
   * What the budget planner decided: how the window was spent and what was left
   * out. Undefined only when planning was bypassed. The eval harness reads this
   * to tell "the model answered badly" apart from "the model never saw it".
   */
  budget?: BudgetTrace
  /** Uncalibrated prompt estimate, fed to TokenCalibrationService after the call. */
  uncalibratedPromptTokens?: number
}

export type FileWarning =
  | { kind: 'zero_chunks'; fileSizeBytes: number }
  | { kind: 'partial_stall'; chunksEmbedded: number; chunksExpected: number }

/**
 * Row returned by `GET /api/rag/files`. `state` is null for sources that exist
 * in Qdrant but have no `kb_ingest_state` row (pre-RFC-883 installs where the
 * scanner hasn't yet backfilled). `chunksEmbedded` mirrors the state-machine
 * field; 0 for state-row-less or zero-chunk files.
 */
export type StoredFileInfo = {
  source: string
  state: import('./kb_ingest_state.js').KbIngestStateValue | null
  chunksEmbedded: number
  /** Filename portion of `source` (last path segment). */
  fileName: string
  /** File size in bytes from disk; null if the file is missing or unreadable. */
  size: number | null
  /** Last-modified timestamp from disk (ISO 8601); null if unavailable. */
  uploadedAt: string | null
  /** True when `source` lives under the user-uploads directory. Drives which
   * rows offer view/download in the UI. */
  isUserUpload: boolean
  /** Subject/category tag, or null if uncategorized. */
  collection: string | null
  /** Whether this file's chunks are included in RAG search results. Toggling
   * this never deletes or re-embeds vectors — see #1119. */
  active: boolean
}

/**
 * Result of computing per-file warnings. `ok: false` means the computation
 * itself failed (Qdrant unreachable, DB outage, FS read error) — distinct from
 * `ok: true` with an empty map, which means every scanned file is healthy.
 * The frontend should surface a neutral "warnings unavailable" indicator on
 * `!ok` rather than implying everything is fine.
 */
export type FileWarningsResult = {
  ok: boolean
  warnings: Record<string, FileWarning[]>
}