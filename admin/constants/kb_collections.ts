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
  return trimmed.slice(0, KB_COLLECTION_NAME_MAX_LENGTH)
}
