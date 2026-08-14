import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Widen `installed_resources.resource_type` to accept 'dataset'.
 *
 * The model already declares `'zim' | 'map' | 'dataset'` and
 * `IngestDrugDataJob` writes a 'dataset' row for the openFDA drug labels, but
 * the column was still `enum('zim','map')` from the table's original
 * migration. Every write failed with "Data truncated for column
 * 'resource_type'", so the drug reference ingested its 261k labels and then
 * left no install-state row — the tier-status math and the home-tile gate both
 * read those rows, so the resource stayed invisible to them.
 */
export default class extends BaseSchema {
  protected tableName = 'installed_resources'

  async up() {
    await this.db.rawQuery(
      "ALTER TABLE installed_resources MODIFY COLUMN resource_type " +
        "enum('zim','map','dataset') NOT NULL"
    )
  }

  async down() {
    // Rows that only exist because of this widening have to go before the
    // column can be narrowed again; MySQL would otherwise truncate them to ''
    // (or fail outright under STRICT_TRANS_TABLES).
    await this.db.rawQuery("DELETE FROM installed_resources WHERE resource_type = 'dataset'")
    await this.db.rawQuery(
      "ALTER TABLE installed_resources MODIFY COLUMN resource_type " +
        "enum('zim','map') NOT NULL"
    )
  }
}
