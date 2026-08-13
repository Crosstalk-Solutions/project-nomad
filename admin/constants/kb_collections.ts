/**
 * Curated starter tags shown in the collection picker. These are just
 * suggested defaults — the actual set of usable tags is open-ended, since
 * `collection` is a free-form string and getKnowledgeCollections() returns
 * whatever's actually in use (see RagService). Kept general-purpose rather
 * than survival-specific so NOMAD's Knowledge Base reads well for home-lab,
 * reference, and everyday use too.
 */
export const KB_COLLECTIONS = [
  'recipes',
  'diy',
  'health',
  'technology',
  'finance',
  'travel',
  'hobbies',
  'reference',
  'survival',
  'energy',
] as const

export type KbCollection = (typeof KB_COLLECTIONS)[number]

/**
 * Reserved collection tag for the developer evaluation corpus (`ace eval:*`).
 *
 * The eval fixtures live in the same Qdrant collection as everything else —
 * NOMAD "collections" are a payload tag, not separate Qdrant collections — so
 * this tag is what keeps them out of the user's Knowledge Base UI and out of
 * ordinary chat retrieval. Every read path that enumerates user content filters
 * it out, and `sanitizeCollectionName` refuses to mint it, so a user cannot
 * create a colliding tag by accident.
 *
 * The leading/trailing underscores are deliberate: they make the tag obviously
 * internal if it ever does surface in a log or a raw Qdrant query.
 */
export const KB_EVAL_COLLECTION = '__nomad_eval__'

/** Hard cap on a user-created tag's length, enforced client- and server-side. */
export const KB_COLLECTION_NAME_MAX_LENGTH = 40

/**
 * Normalize a user-entered collection name: trim whitespace, lowercase, cap
 * length. Returns null for empty/whitespace-only input, meaning
 * "uncategorized". Lowercasing is what makes de-dupe work — "Medical" and
 * "medical" normalize to the same tag rather than forking into two, so this
 * must run on every write path (upload, reassignment, rename) both
 * client-side for instant feedback and server-side as the actual guarantee.
 */
export function sanitizeCollectionName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  // The eval tag is reserved. Treating a collision as "uncategorized" rather
  // than throwing keeps this a pure normalizer, and the user's documents stay
  // visible in the KB instead of vanishing into a hidden internal collection.
  if (trimmed === KB_EVAL_COLLECTION) return null
  return trimmed.slice(0, KB_COLLECTION_NAME_MAX_LENGTH)
}
