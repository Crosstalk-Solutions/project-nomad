import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'curated_collections'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('slug').primary()
      table.enum('type', ['zim', 'map']).notNullable()
      table.string('name').notNullable()
      table.text('description').notNullable()
      table.string('icon').notNullable()
      table.string('language').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
