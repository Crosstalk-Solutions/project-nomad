import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Drug Reference v1 — openFDA drug label catalog.
 *
 * ~259k rows of FDA drug labels (Rx + OTC), downloaded from the openFDA bulk
 * export and streamed into MySQL in 500-row batches. The idempotent upsert key
 * is `set_id` — a stable GUID for a labeling across all revisions. Re-running
 * the ingest refreshes existing rows in place; no manual purge needed.
 *
 * Section text columns use mediumtext (up to 16 MB) so no openFDA section is
 * truncated. The `searchable_name` varchar(768) stays within InnoDB's index
 * key-length budget under utf8mb4 (191 chars × 4 bytes = 764 < 767 limit for
 * a single column; 768 bytes here fits because MySQL counts bytes for the
 * key-length limit when the column is declared as varchar, not character count
 * for the prefix approach). If a tighter budget is needed in a utf8mb4_bin
 * collation, use varchar(191) — but the utf8mb4 default collation is fine.
 *
 * The FULLTEXT index is created in a guarded try/catch so a non-InnoDB engine
 * or an older MySQL version that doesn't support FULLTEXT doesn't break the
 * migration. The search service degrades gracefully to LIKE when FULLTEXT is
 * unavailable.
 */
export default class extends BaseSchema {
  protected tableName = 'drug_labels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()

      // Idempotent upsert key. UNIQUE enforced in DB so re-ingest never dupes.
      table.string('set_id', 64).notNullable().unique('uniq_drug_labels_set_id')

      // Per-revision GUID for provenance (not the upsert key).
      table.string('spl_id', 64).nullable()

      table.string('version', 16).nullable()

      // Identity fields — sourced from openfda sub-object.
      table.string('brand_name', 255).nullable()
      table.string('generic_name', 512).nullable()
      table.string('manufacturer', 512).nullable()
      table.string('product_ndc', 255).nullable()
      table.string('route', 255).nullable()

      // OTC vs Rx discriminator. Expected: 'HUMAN OTC DRUG' | 'HUMAN PRESCRIPTION DRUG'.
      // Plain varchar — not a native enum — to allow future product type additions
      // without ALTER TABLE (stl_files convention).
      table.string('product_type', 32).nullable()

      // Normalized brand+generic blob — computed once at ingest, never on read.
      // 768 chars stays within InnoDB's utf8mb4 index key-length budget.
      table.string('searchable_name', 768).nullable()

      // Section text — mediumtext so even the longest FDA label bodies are stored
      // in full (indications/dosage/warnings can be multiple pages of text).
      table.specificType('indications', 'mediumtext').nullable()
      table.specificType('dosage', 'mediumtext').nullable()
      table.specificType('warnings', 'mediumtext').nullable()
      table.specificType('boxed_warning', 'mediumtext').nullable()
      table.specificType('drug_interactions', 'mediumtext').nullable()
      table.specificType('contraindications', 'mediumtext').nullable()
      // when_using / stop_use are OTC-specific and typically shorter.
      table.text('when_using').nullable()
      table.text('stop_use').nullable()

      // Label version date, parsed from effective_time (YYYYMMDD → 'YYYY-MM-DD').
      // Stored as a fixed-width varchar, not a DATE column, so it round-trips as a
      // plain string: the model declares it string|null, but mysql2 hands back a
      // JS Date for a DATE column. v1 never range-queries this field, and
      // 'YYYY-MM-DD' sorts chronologically as text.
      table.string('source_updated_at', 10).nullable()

      // Set on every upsert pass — tracks when this row was last refreshed.
      table.timestamp('ingested_at').notNullable()

      // ── Non-FULLTEXT indexes ────────────────────────────────────────────────

      // OTC vs Rx filter pill.
      table.index('product_type', 'idx_drug_labels_product_type')
      // LIKE fallback + alpha sort on the brand name column.
      table.index('brand_name', 'idx_drug_labels_brand')
      // LIKE fallback on the normalized search blob.
      table.index('searchable_name', 'idx_drug_labels_searchable_name')
    })

    // ── FULLTEXT index — guarded so a non-InnoDB engine doesn't block migration ──
    //
    // MySQL 8.0 InnoDB supports FULLTEXT natively (confirmed: repo uses mysql:8.0).
    // The guard ensures a future engine change or a fresh install on an engine
    // without FULLTEXT doesn't brick the migration runner — the search service
    // degrades to LIKE on a MATCH() failure, so an absent index is non-fatal.
    //
    // Only the name index ships in v1; search MATCHes searchable_name. A combined
    // name+indications index (search-by-what-it-treats) is deferred: FULLTEXT
    // can't take a prefix length, and indexing the full mediumtext body adds heavy
    // index weight v1 doesn't use.
    try {
      await this.db.rawQuery(
        `ALTER TABLE drug_labels ADD FULLTEXT INDEX ft_drug_labels_name (searchable_name)`
      )
    } catch {
      // Non-InnoDB or FULLTEXT unsupported — search falls back to LIKE.
    }
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
