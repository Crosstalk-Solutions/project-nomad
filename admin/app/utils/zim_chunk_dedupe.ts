import { createHash } from 'node:crypto'

/**
 * Exact-duplicate suppression for ZIM chunks (#1438).
 *
 * Section-level chunking turns every article's shared chrome (site banners,
 * disclaimers, sidebar link lists, survey prompts) into a chunk of its own, so a
 * scraped-site ZIM such as MedlinePlus ends up with a third of its points being
 * byte-identical copies: the same text embedded once per article. Thousands of
 * identical vectors form cliques in Qdrant's HNSW graph that the search walk
 * cannot leave, and approximate search then stops returning points an exact
 * search still finds. The fix is simply to never store the same text twice for
 * the same file.
 *
 * This is the pure, I/O-free core: hashing and the keep/drop decision. The
 * caller (`RagService.processZIMFile`) supplies the hashes already stored for
 * the file, because a ZIM is ingested in independent batches and the first
 * batch that saw a text is the one that keeps it.
 */

/** Stable fingerprint of a chunk's text, independent of surrounding whitespace. */
export function chunkTextHash(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return createHash('sha1').update(normalized).digest('hex')
}

export interface DedupeResult<T> {
  /** Chunks to embed, in their original order, each tagged with its hash. */
  kept: Array<{ chunk: T; hash: string }>
  /** Chunks dropped because an earlier chunk in this batch has the same text. */
  droppedInBatch: number
  /** Chunks dropped because an earlier batch already stored the same text. */
  droppedStored: number
}

/**
 * Keep the first occurrence of each text; drop later copies, whether they come
 * from this batch or (via `storedHashes`) from a batch that already ran.
 */
export function dedupeZimChunks<T extends { text: string }>(
  chunks: T[],
  storedHashes: ReadonlySet<string>
): DedupeResult<T> {
  const seen = new Set<string>()
  const kept: Array<{ chunk: T; hash: string }> = []
  let droppedInBatch = 0
  let droppedStored = 0

  for (const chunk of chunks) {
    const hash = chunkTextHash(chunk.text)
    if (seen.has(hash)) {
      droppedInBatch++
      continue
    }
    seen.add(hash)
    if (storedHashes.has(hash)) {
      droppedStored++
      continue
    }
    kept.push({ chunk, hash })
  }

  return { kept, droppedInBatch, droppedStored }
}
