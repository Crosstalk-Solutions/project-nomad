import { BaseSchema } from '@adonisjs/lucid/schema'
import logger from '@adonisjs/core/services/logger'

/**
 * Re-create the drug_labels FULLTEXT indexes when they are missing.
 *
 * Migrations 1778600000004 and 1778600000006 wrapped the index creation in a
 * bare `catch {}`, so a transient failure (lock wait timeout, full disk) was
 * swallowed and the migration still recorded as done — leaving search on
 * full-table LIKE scans for good. This checks for each index and creates it if
 * absent. Only "engine has no FULLTEXT support" is tolerated (logged); any other
 * error fails the migration so it is retried on the next run.
 */
const INDEXES: Array<{ name: string; columns: string }> = [
  { name: 'ft_drug_labels_name', columns: 'searchable_name' },
  { name: 'ft_drug_labels_name_indications', columns: 'searchable_name, indications' },
]

// ER_TABLE_CANT_HANDLE_FT: "The used table type doesn't support FULLTEXT indexes".
const FULLTEXT_UNSUPPORTED_ERRNO = 1214

export default class extends BaseSchema {
  async up() {
    for (const { name, columns } of INDEXES) {
      const [rows] = await this.db.rawQuery('SHOW INDEX FROM drug_labels WHERE Key_name = ?', [name])
      if (Array.isArray(rows) && rows.length > 0) continue

      try {
        // name/columns are module constants, never user input.
        await this.db.rawQuery(`ALTER TABLE drug_labels ADD FULLTEXT INDEX ${name} (${columns})`)
        logger.info(`[migration] created missing FULLTEXT index ${name}`)
      } catch (err) {
        const e = err as { errno?: number; code?: string; message?: string }
        if (e.errno === FULLTEXT_UNSUPPORTED_ERRNO || e.code === 'ER_TABLE_CANT_HANDLE_FT') {
          logger.warn(`[migration] FULLTEXT unsupported, ${name} not created; search uses LIKE: ${e.message}`)
          continue
        }
        throw err
      }
    }
  }

  async down() {
    // No-op: the indexes belong to the earlier migrations, whose down() drops them.
  }
}
