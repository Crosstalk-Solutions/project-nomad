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