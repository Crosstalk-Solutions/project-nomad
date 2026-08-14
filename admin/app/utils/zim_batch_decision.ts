/**
 * Decision for whether a batched ZIM ingestion should dispatch a continuation.
 *
 * This is the pure, I/O-free core of the batch loop in
 * `RagService.processZIMFile` (mirrors `decideScanAction` in
 * `kb_ingest_decision.ts`).
 *
 * The signal MUST be the number of articles the extractor *consumed*, never the
 * number that produced chunks. An article yields zero chunks whenever its text
 * is empty after HTML cleaning — redirect stubs, category listings, image/video
 * wrappers, PDF containers. Those are perfectly normal ZIM entries, but they are
 * invisible to any count derived from the returned chunks.
 *
 * Gating on chunk-derived counts silently truncates ingestion the first time a
 * window of `batchSize` articles happens to contain mostly empty ones: the
 * continuation is never dispatched and every remaining article in the archive is
 * skipped. That is not a rare edge case — it is the norm for scraped-site and
 * media-heavy archives, where the opening entries are usually navigation pages.
 *
 * `articlesProcessed < batchSize` means the extractor's iterator ran dry, which
 * is the only reliable end-of-archive signal available: `archive.articleCount`
 * cannot serve as an upper bound, because `iterByPath()` legitimately yields
 * more article entries than that figure for some archives.
 *
 * A full final batch costs one extra dispatch that extracts nothing and stops.
 * That is deliberate: over-running by a single empty batch is cheap, while
 * stopping one batch early loses the remainder of the archive.
 */
export interface ZimBatchProgress {
  /** Articles the extractor consumed in this batch (not articles that produced chunks). */
  articlesProcessed: number
  /** The article ceiling requested for this batch. */
  batchSize: number
}

export function hasMoreArticleBatches({
  articlesProcessed,
  batchSize,
}: ZimBatchProgress): boolean {
  return articlesProcessed >= batchSize
}
