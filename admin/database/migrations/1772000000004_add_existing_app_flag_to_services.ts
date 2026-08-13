import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_existing').notNullable().defaultTo(false)
    })

    this.defer(async (db) => {
      // Earlier Add Existing App records were saved as custom apps with no generated
      // container_config. Backfill those so they keep their external-container semantics.
      await db
        .from(this.tableName)
        .where('is_custom', true)
        .whereNull('container_config')
        .update({ is_existing: true })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_existing')
    })
  }
}
