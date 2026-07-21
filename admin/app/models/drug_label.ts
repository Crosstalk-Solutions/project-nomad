import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

/**
 * Drug Reference v1 — openFDA drug label catalog entry.
 *
 * One row per FDA `set_id` (stable GUID for a labeling, across all revisions).
 * Re-ingesting updates existing rows idempotently via `set_id` UNIQUE key.
 *
 * Enum-ish columns (product_type) are plain varchars validated at the edge —
 * the stl_files / inventory_items convention: no native DB enums, so the
 * schema can evolve without ALTER TABLE.
 *
 * All section-text columns are optional: label records frequently omit
 * sections (e.g. OTC labels have no `boxed_warning`). The mapper returns
 * null for any absent or empty section.
 */
export default class DrugLabel extends BaseModel {
  static table = 'drug_labels'
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  /** openFDA set_id — stable GUID across label revisions. Idempotent upsert key. */
  @column()
  declare set_id: string

  /** openFDA id — per-revision GUID for provenance. */
  @column()
  declare spl_id: string | null

  @column()
  declare version: string | null

  /** openfda.brand_name[0] — first element only. */
  @column()
  declare brand_name: string | null

  /** openfda.generic_name joined with ", " (labels can list several). */
  @column()
  declare generic_name: string | null

  /** openfda.manufacturer_name[0]. */
  @column()
  declare manufacturer: string | null

  /** openfda.product_ndc joined with ", ". */
  @column()
  declare product_ndc: string | null

  /** openfda.route joined with ", ". */
  @column()
  declare route: string | null

  /**
   * openfda.product_type[0]. Drives OTC vs Rx badge + filter.
   * Expected values: 'HUMAN OTC DRUG' | 'HUMAN PRESCRIPTION DRUG'.
   */
  @column()
  declare product_type: string | null

  /**
   * Normalized brand+generic blob for FULLTEXT and LIKE search.
   * Built by normalizeDrugName() at ingest time; never re-computed on read.
   * Max 768 chars — stays inside InnoDB utf8mb4 index key-length budget.
   */
  @column()
  declare searchable_name: string | null

  /** Flattened indications_and_usage sections, joined with \n\n. */
  @column()
  declare indications: string | null

  /** Flattened dosage_and_administration sections. */
  @column()
  declare dosage: string | null

  /** Flattened warnings sections. */
  @column()
  declare warnings: string | null

  /** Flattened boxed_warning sections (absent on most OTC labels). */
  @column()
  declare boxed_warning: string | null

  /**
   * Flattened drug_interactions label text.
   * Single-drug label info only — NOT a pairwise cross-drug checker.
   */
  @column()
  declare drug_interactions: string | null

  /** Flattened contraindications sections. */
  @column()
  declare contraindications: string | null

  /** Flattened when_using sections (common on OTC labels). */
  @column()
  declare when_using: string | null

  /** Flattened stop_use sections (common on OTC labels). */
  @column()
  declare stop_use: string | null

  /**
   * Parsed from effective_time (YYYYMMDD → YYYY-MM-DD).
   * Stored as a plain date string, not a Luxon DateTime, because
   * the source format is just a date (no time component).
   */
  @column()
  declare source_updated_at: string | null

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'ingested_at' })
  declare ingested_at: DateTime
}
