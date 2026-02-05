import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'installed_tiers'

  async up() {
    this.schema.dropTableIfExists(this.tableName)
  }

  async down() {
    // Recreate the table if we need to rollback
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('category_slug').notNullable().unique()
      table.string('tier_slug').notNullable()
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })
  }
}