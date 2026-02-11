import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'collection_manifests'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('type').primary() // 'zim_categories' | 'maps' | 'wikipedia'
      table.string('spec_version').notNullable()
      table.json('spec_data').notNullable()
      table.timestamp('fetched_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
