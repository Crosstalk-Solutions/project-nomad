import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-file "private" flag for the knowledge base: a private file's passages are
 * never put into a prompt bound for a remote AI server (`ai.remoteOllamaUrl`).
 * Defaults to false, so existing files behave exactly as before.
 *
 * Named `is_private` rather than `private` because the latter is a reserved
 * modifier in the model class.
 */
export default class extends BaseSchema {
  protected tableName = 'kb_ingest_state'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_private').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_private')
    })
  }
}
