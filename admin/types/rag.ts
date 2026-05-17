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

export type FileWarning =
  | { kind: 'zero_chunks'; fileSizeBytes: number }
  | { kind: 'partial_stall'; chunksEmbedded: number; chunksExpected: number }

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