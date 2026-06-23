/**
 * "When to use what" — condition-first reference types (Phase 1 + Phase 2).
 *
 * A condition (situation) is a curated first-aid / emergency scenario the user
 * browses or searches. Each carries `searchTerms` (synonyms) that drive the
 * FULLTEXT search over `drug_labels.indications` — the same machinery the
 * Drug Reference indication search (#11) uses.
 *
 * Phase 1 maps conditions → OTC drugs.
 * Phase 2 adds natural remedies from NCCIH, resolved against the same condition
 * spine (in-memory, no DB table).
 *
 * All server → client transfer shapes for this feature live in this file.
 */

import type { DrugSearchResult } from './drug_reference.js'

// ─── Curated condition spine ──────────────────────────────────────────────────

/**
 * One curated condition/situation.
 *
 * - `slug`        URL-safe stable id (e.g. "burns"). The detail route key.
 * - `label`       Human-facing name (e.g. "Burns").
 * - `category`    Grouping for the browse grid (e.g. "Skin & wounds").
 * - `searchTerms` Synonyms expanded into the FULLTEXT query (e.g.
 *                 ["burn", "scald", "sunburn"]). Curation quality drives
 *                 result quality, so these are hand-tuned, not generated.
 */
export interface Condition {
  slug: string
  label: string
  category: string
  searchTerms: string[]
}

/**
 * The versioned condition-spine file shape. `version` lets the curated list
 * evolve without a migration (the taxonomy is data, not schema), mirroring the
 * `spec_version` field on collections/kiwix-categories.json.
 */
export interface ConditionsFile {
  version: string
  conditions: Condition[]
}

// ─── Natural remedies (Phase 2) ───────────────────────────────────────────────

/**
 * One curated natural / herbal remedy from NCCIH "Herbs at a Glance".
 *
 * - `slug`        URL-safe stable id (e.g. "ginger"). Used for dedup.
 * - `name`        Human-facing name (e.g. "Ginger").
 * - `commonNames` Botanical / alternate names (e.g. ["Zingiber officinale"]).
 * - `conditions`  Curated mapping to condition slugs. The join key — a remedy
 *                 surfaces for a condition if its slug appears here.
 * - `uses`        Plain-language summary of traditional / common use.
 * - `evidence`    NCCIH evidence tone ("limited/mixed evidence" etc.).
 * - `cautions`    Key safety notes, interactions, who should avoid.
 * - `sourceUrl`   Canonical NCCIH fact-sheet URL for the "Learn more" link.
 */
export interface NaturalRemedy {
  slug: string
  name: string
  commonNames: string[]
  conditions: string[]
  uses: string
  /**
   * Practical offline instructions ("how to do/prepare it") sourced from the
   * same cited page. Optional — absent when the source gives no actionable
   * how-to (we never invent dosages or steps). The offline-mission field: the
   * sourceUrl link is dead without internet, so the card must carry the how.
   */
  how?: string
  evidence: string
  cautions: string
  sourceUrl: string
  /**
   * Which curated corpus the entry came from. 'herb' = NCCIH herbal fact
   * sheets; 'self-care' = non-herbal home-care measures from CDC/NIH/FDA pages
   * (issue #23). Assigned at merge time in condition_service — the JSON files
   * don't carry it. Optional so older data parses; absent means 'herb'.
   */
  kind?: 'herb' | 'self-care'
}

/**
 * The versioned natural-remedies file shape. Mirrors the ConditionsFile
 * convention — `version` tracks the curation date; `source` carries the
 * public-domain credit required by NCCIH's terms.
 */
export interface NaturalRemediesFile {
  version: string
  source: {
    name: string
    url: string
    license: string
  }
  remedies: NaturalRemedy[]
}

// ─── DTOs (server → client) ───────────────────────────────────────────────────

/**
 * Slim condition shape for the browse grid — omits `searchTerms` (a
 * server-only search-implementation detail the client never needs).
 */
export interface ConditionSummary {
  slug: string
  label: string
  category: string
}

/**
 * Result of resolving a condition (by slug or free text) to matching OTC drugs
 * and natural remedies (Phase 2).
 *
 * - `condition` is the matched curated condition when resolving by slug, or a
 *   synthetic summary echoing the free-text query when off-list.
 * - `drugs` reuses the Drug Reference collapsed search result shape so the
 *   existing DrugResultRow renders them unchanged.
 * - `remedies` is the Phase-2 natural-remedy list — empty array when none match
 *   (never undefined so client code can always iterate safely).
 */
export interface ConditionDrugsResult {
  condition: ConditionSummary
  drugs: DrugSearchResult[]
  remedies: NaturalRemedy[]
}
