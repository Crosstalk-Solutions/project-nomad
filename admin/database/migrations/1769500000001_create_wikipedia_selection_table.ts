import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'wikipedia_selections'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('option_id').notNullable()
      table.string('url').nullable()
      table.string('filename').nullable()
      table.enum('status', ['none', 'downloading', 'installed', 'failed']).defaultTo('none')
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
