/**
 * Qdrant's facet API lists every value present in the payload index for a
 * key, and with `exact: true` it still lists values whose points have all
 * been deleted, with `count: 0`, until the segment is optimized. Code that
 * turns facet hits into "sources that exist in the knowledge base" has to
 * drop those, or a file the user just removed comes back: the storage sync
 * backfills an `indexed` row for it, Stored Files lists it with 0 chunks,
 * and the collection picker keeps offering an empty collection.
 */
export interface FacetHitLike {
  value: unknown
  count: number
}

/** The string-valued facet hits that still have at least one point behind them. */
export function facetHitsWithPoints(
  hits: readonly FacetHitLike[]
): { value: string; count: number }[] {
  const out: { value: string; count: number }[] = []
  for (const hit of hits) {
    if (typeof hit.value === 'string' && hit.count > 0)
      out.push({ value: hit.value, count: hit.count })
  }
  return out
}
