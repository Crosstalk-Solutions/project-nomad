import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'curated_collection_resources'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('curated_collection_slug').notNullable().references('slug').inTable('curated_collections').onDelete('CASCADE')
      table.string('title').notNullable()
      table.string('url').notNullable()
      table.text('description').notNullable()
      table.integer('size_mb').notNullable()
      table.boolean('downloaded').notNullable().defaultTo(false)
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}