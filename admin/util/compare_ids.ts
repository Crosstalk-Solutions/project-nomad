/**
 * Drug Reference — comparison id-list utilities.
 *
 * Pure module (no Lucid / HTTP imports) so it can be unit-tested without
 * booting the AdonisJS container. Mirrors the file_classification.ts pattern.
 */

/** Maximum number of drugs that can be compared side-by-side. */
export const MAX_COMPARE = 5

/**
 * Parse a raw comma-separated id string into a validated, deduped,
 * capped list of positive integer ids.
 *
 * Rules (in order):
 *   1. Split on commas.
 *   2. Trim whitespace from each segment.
 *   3. Parse each segment as a base-10 integer.
 *   4. Drop any result that is not a finite integer > 0.
 *   5. Dedupe, preserving first-occurrence order.
 *   6. Cap the list at MAX_COMPARE entries; extras are silently dropped.
 *
 * Returns [] for an empty/entirely-invalid input.
 *
 * @example
 *   parseCompareIds('1,2,3')         // [1, 2, 3]
 *   parseCompareIds('2,1,2,3,4,5,6') // [2, 1, 3, 4, 5]  (deduped, capped at 5)
 *   parseCompareIds('0,-1,abc,')     // []
 *   parseCompareIds('  3 , 1 ')      // [3, 1]
 */
export function parseCompareIds(raw: string): number[] {
  if (!raw || raw.trim() === '') return []

  const seen = new Set<number>()
  const result: number[] = []

  for (const segment of raw.split(',')) {
    if (result.length >= MAX_COMPARE) break

    const trimmed = segment.trim()
    if (trimmed === '') continue

    const n = Number(trimmed)

    // Must be a finite integer greater than zero.
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) continue

    if (seen.has(n)) continue

    seen.add(n)
    result.push(n)
  }

  return result
}
