import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Drug Reference v2 — combined name+indications FULLTEXT index.
 *
 * Adds a FULLTEXT index over (searchable_name, indications) so users can
 * search by what a drug treats ("heartburn", "high blood pressure") in
 * addition to the existing name-only search path.
 *
 * Design notes:
 * - FULLTEXT indexes cannot take a column prefix length, so the full
 *   mediumtext body of `indications` is indexed. On ~259k rows this adds
 *   meaningful index weight (tracked in issue #11).
 * - The guard mirrors the existing ft_drug_labels_name guard in migration
 *   1778600000004: a non-InnoDB engine or a MySQL version without FULLTEXT
 *   support must not block the migration runner. The indication-search path
 *   degrades gracefully to a LIKE fallback when the index is absent.
 * - The MATCH() column list in DrugReferenceService MUST be exactly
 *   (searchable_name, indications) — matching this index — or MySQL will
 *   refuse the query with "Can't find FULLTEXT index matching the column list".
 */
export default class extends BaseSchema {
  async up() {
    // ── Combined name+indications FULLTEXT index — guarded ──────────────────
    try {
      await this.db.rawQuery(
        `ALTER TABLE drug_labels ADD FULLTEXT INDEX ft_drug_labels_name_indications (searchable_name, indications)`
      )
    } catch {
      // Non-InnoDB or FULLTEXT unsupported — indication search falls back to LIKE.
    }
  }

  async down() {
    // ── Drop guarded — index may not exist if up() guard caught an error ────
    try {
      await this.db.rawQuery(
        `ALTER TABLE drug_labels DROP INDEX ft_drug_labels_name_indications`
      )
    } catch {
      // Index never existed — nothing to drop.
    }
  }
}
