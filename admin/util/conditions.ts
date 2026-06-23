/**
 * "When to use what" — pure, unit-testable helpers (Phase 1 + Phase 2).
 *
 * NO Lucid / AdonisJS / HTTP imports. These take plain objects and return plain
 * objects so they run standalone under `node --experimental-strip-types` without
 * booting MySQL or Redis. Mirrors the `drug_labels.ts` helper convention.
 */

import type {
  Condition,
  ConditionsFile,
  ConditionSummary,
  NaturalRemedy,
  NaturalRemediesFile,
} from '../types/conditions.js'
import type { DrugSearchResult } from '../types/drug_reference.js'

/**
 * Canonical FDA product_type strings, mirrored from `PRODUCT_TYPES` in
 * types/drug_reference.ts. Inlined here (not imported) so this module stays a
 * pure, value-import-free helper runnable under `node --experimental-strip-types`
 * (which does not rewrite `.js` specifiers to `.ts` for runtime value imports).
 * The standalone test asserts these equal PRODUCT_TYPES.OTC / .RX, so they
 * cannot drift from the canonical source.
 */
export const OTC_PRODUCT_TYPE = 'HUMAN OTC DRUG'
export const RX_PRODUCT_TYPE = 'HUMAN PRESCRIPTION DRUG'

// ─── Spine parsing (fail-soft) ────────────────────────────────────────────────

/** Trim a value to a non-empty string, or return null. */
function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Validate + coerce one raw condition entry into a typed Condition.
 *
 * Returns null when the entry is structurally unusable (missing slug/label/
 * category, or no usable searchTerms) so the caller can skip it rather than
 * surface a broken row. searchTerms are de-duped (case-insensitive) and
 * stripped of empties; an entry with zero usable terms is dropped (it could
 * never match anything).
 */
export function parseConditionEntry(raw: unknown): Condition | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const slug = nonEmptyString(r.slug)
  const label = nonEmptyString(r.label)
  const category = nonEmptyString(r.category)
  if (!slug || !label || !category) return null

  if (!Array.isArray(r.searchTerms)) return null
  const seen = new Set<string>()
  const searchTerms: string[] = []
  for (const term of r.searchTerms) {
    const clean = nonEmptyString(term)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    searchTerms.push(clean)
  }
  if (searchTerms.length === 0) return null

  return { slug, label, category, searchTerms }
}

/**
 * Defensively parse a ConditionsFile-shaped object.
 *
 * A non-object, a missing/empty `conditions` array, or every entry being
 * malformed all yield an empty `conditions` list (with a best-effort version)
 * rather than throwing — the page then degrades to free-text-only search
 * instead of crashing. Duplicate slugs keep the FIRST occurrence (the curated
 * order is intentional).
 */
export function parseConditionsFile(json: unknown): ConditionsFile {
  if (typeof json !== 'object' || json === null) {
    return { version: 'unknown', conditions: [] }
  }
  const root = json as Record<string, unknown>
  const version = nonEmptyString(root.version) ?? 'unknown'

  if (!Array.isArray(root.conditions)) {
    return { version, conditions: [] }
  }

  const seenSlugs = new Set<string>()
  const conditions: Condition[] = []
  for (const raw of root.conditions) {
    const entry = parseConditionEntry(raw)
    if (!entry) continue
    if (seenSlugs.has(entry.slug)) continue
    seenSlugs.add(entry.slug)
    conditions.push(entry)
  }

  return { version, conditions }
}

// ─── Lookup + projection ──────────────────────────────────────────────────────

/** Find a condition by its slug (exact match). Returns null when absent. */
export function findConditionBySlug(conditions: Condition[], slug: string): Condition | null {
  const target = slug.trim()
  if (!target) return null
  return conditions.find((c) => c.slug === target) ?? null
}

/** Project a Condition to the client-facing summary (drops searchTerms). */
export function toConditionSummary(condition: Condition): ConditionSummary {
  return {
    slug: condition.slug,
    label: condition.label,
    category: condition.category,
  }
}

// ─── Reverse link: indications text → curated situations ──────────────────────

/**
 * The other direction of the symbiotic relationship: given a single drug's
 * indications-and-usage text, find which curated situations it treats.
 *
 * A condition matches when ANY of its searchTerms appears as a case-insensitive
 * substring of the indications text. Substring (not word-boundary or FULLTEXT)
 * matching mirrors the FULLTEXT/LIKE intent of the forward search closely enough
 * for a "Commonly used for" affordance, while staying a pure string operation
 * with no DB. Curated order is preserved and results are deduped by slug.
 *
 * Blank/empty input → [] (a label with no indications treats nothing here).
 */
export function situationsForIndications(
  indicationsText: string | null | undefined,
  conditions: Condition[]
): ConditionSummary[] {
  if (typeof indicationsText !== 'string') return []
  const haystack = indicationsText.toLowerCase()
  if (haystack.trim().length === 0) return []

  const matched: ConditionSummary[] = []
  const seen = new Set<string>()
  for (const condition of conditions) {
    if (seen.has(condition.slug)) continue
    const hit = condition.searchTerms.some((term) => {
      const needle = term.trim().toLowerCase()
      return needle.length > 0 && haystack.includes(needle)
    })
    if (hit) {
      seen.add(condition.slug)
      matched.push(toConditionSummary(condition))
    }
  }
  return matched
}

// ─── FULLTEXT query construction ──────────────────────────────────────────────

/**
 * Build a MySQL NATURAL LANGUAGE MODE query string from a condition's
 * searchTerms.
 *
 * - Multi-word terms are wrapped in double quotes so they match as a phrase
 *   ("sore throat") rather than as two loose tokens — this trades a little
 *   recall for precision on multi-word conditions.
 * - Single-word terms are passed through bare.
 * - Internal double-quotes inside a term are stripped (they would break the
 *   phrase quoting).
 * - Terms are de-duped (case-insensitive) and empties dropped. An all-empty
 *   input yields '' so the caller can short-circuit to the LIKE fallback.
 *
 * NATURAL LANGUAGE MODE treats the space-joined terms as an OR-ish relevance
 * query, which is what we want: any synonym can surface a matching label, ranked
 * by relevance.
 */
export function buildIndicationQuery(searchTerms: string[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const raw of searchTerms) {
    if (typeof raw !== 'string') continue
    const term = raw.trim().replace(/"/g, '')
    if (term.length === 0) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(/\s/.test(term) ? `"${term}"` : term)
  }
  return parts.join(' ')
}

// ─── Natural remedies (Phase 2) — parsing + lookup ───────────────────────────

/**
 * Validate + coerce one raw remedy entry into a typed NaturalRemedy.
 *
 * Returns null when the entry is structurally unusable (missing required string
 * fields or conditions array) so the caller can skip it rather than surface a
 * broken row. Mirrors the defensive posture of parseConditionEntry.
 */
export function parseRemedyEntry(raw: unknown): NaturalRemedy | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const slug = nonEmptyString(r.slug)
  const name = nonEmptyString(r.name)
  const uses = nonEmptyString(r.uses)
  const evidence = nonEmptyString(r.evidence)
  const cautions = nonEmptyString(r.cautions)
  const sourceUrl = nonEmptyString(r.sourceUrl)
  if (!slug || !name || !uses || !evidence || !cautions || !sourceUrl) return null

  if (!Array.isArray(r.commonNames)) return null
  const commonNames: string[] = []
  for (const cn of r.commonNames) {
    const clean = nonEmptyString(cn)
    if (clean) commonNames.push(clean)
  }

  if (!Array.isArray(r.conditions)) return null
  const conditions: string[] = []
  for (const c of r.conditions) {
    const clean = nonEmptyString(c)
    if (clean) conditions.push(clean)
  }
  // A remedy with no conditions never surfaces — drop it.
  if (conditions.length === 0) return null

  // Optional practical how-to (the offline-mission field) — carried when present.
  const how = nonEmptyString(r.how)
  return how
    ? { slug, name, commonNames, conditions, uses, how, evidence, cautions, sourceUrl }
    : { slug, name, commonNames, conditions, uses, evidence, cautions, sourceUrl }
}

/**
 * Defensively parse a NaturalRemediesFile-shaped object.
 *
 * A non-object, missing/empty `remedies` array, or all malformed entries yield
 * an empty `remedies` list (with a best-effort version) rather than throwing —
 * the UI degrades to "no natural remedies for this condition" instead of
 * crashing. Duplicate remedy slugs keep the FIRST occurrence.
 */
export function parseNaturalRemediesFile(json: unknown): NaturalRemediesFile {
  const empty: NaturalRemediesFile = {
    version: 'unknown',
    source: { name: '', url: '', license: '' },
    remedies: [],
  }

  if (typeof json !== 'object' || json === null) return empty
  const root = json as Record<string, unknown>
  const version = nonEmptyString(root.version) ?? 'unknown'

  let source = { name: '', url: '', license: '' }
  if (typeof root.source === 'object' && root.source !== null) {
    const s = root.source as Record<string, unknown>
    source = {
      name: nonEmptyString(s.name) ?? '',
      url: nonEmptyString(s.url) ?? '',
      license: nonEmptyString(s.license) ?? '',
    }
  }

  if (!Array.isArray(root.remedies)) return { version, source, remedies: [] }

  const seenSlugs = new Set<string>()
  const remedies: NaturalRemedy[] = []
  for (const raw of root.remedies) {
    const entry = parseRemedyEntry(raw)
    if (!entry) continue
    if (seenSlugs.has(entry.slug)) continue
    seenSlugs.add(entry.slug)
    remedies.push(entry)
  }

  return { version, source, remedies }
}

/**
 * Return all remedies whose `conditions` array includes the given slug.
 *
 * Stable order (preserves the curated order of the remedies array). Pure O(remedies)
 * filter — no DB, no fuzzy matching. Returns [] when nothing matches or when file
 * has no remedies.
 */
export function remediesForCondition(file: NaturalRemediesFile, slug: string): NaturalRemedy[] {
  const target = slug.trim()
  if (!target) return []
  return file.remedies.filter((r) => r.conditions.includes(target))
}

/**
 * Short, display-friendly source attribution for a remedy — plain text, NOT a
 * link. NOMAD is offline-first: remedy cards carry everything needed to act and
 * never link out to the internet; this credit satisfies the public-domain
 * attribution without implying connectivity.
 */
export function remedySourceName(remedy: { kind?: 'herb' | 'self-care'; sourceUrl: string }): string {
  if ((remedy.kind ?? 'herb') === 'herb') return 'NCCIH'
  const url = remedy.sourceUrl.toLowerCase()
  if (url.includes('cdc.gov')) return 'CDC'
  if (url.includes('fda.gov')) return 'FDA'
  if (url.includes('medlineplus.gov')) return 'MedlinePlus (NLM)'
  if (url.includes('nih.gov')) return 'NIH'
  return 'US government source'
}

/**
 * Return all remedies matching a free-text query as a secondary fallback.
 *
 * Case-insensitive substring match over `name` and `uses`. Used when a free-text
 * query does not resolve to a curated condition slug. Deduped by slug.
 */
export function remediesForFreeText(file: NaturalRemediesFile, query: string): NaturalRemedy[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const seen = new Set<string>()
  const results: NaturalRemedy[] = []
  for (const r of file.remedies) {
    if (seen.has(r.slug)) continue
    if (r.name.toLowerCase().includes(q) || r.uses.toLowerCase().includes(q)) {
      seen.add(r.slug)
      results.push(r)
    }
  }
  return results
}

// ─── Result ordering ──────────────────────────────────────────────────────────

/**
 * Stable-sort drug results OTC-first.
 *
 * The condition browser is consumer-facing, so over-the-counter products are
 * the most actionable and lead. Order within each tier (OTC → other → Rx) is
 * preserved from the input (which the service already relevance-ranks), so this
 * only re-buckets by product_type without disturbing relevance order.
 *
 * Bucketing: OTC = 0, anything not Rx-and-not-OTC = 1, Rx = 2. Returns a new
 * array; the input is not mutated.
 */
export function orderOtcFirst(drugs: DrugSearchResult[]): DrugSearchResult[] {
  const rank = (d: DrugSearchResult): number => {
    if (d.product_type === OTC_PRODUCT_TYPE) return 0
    if (d.product_type === RX_PRODUCT_TYPE) return 2
    return 1
  }
  return drugs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => rank(a.d) - rank(b.d) || a.i - b.i)
    .map((x) => x.d)
}
