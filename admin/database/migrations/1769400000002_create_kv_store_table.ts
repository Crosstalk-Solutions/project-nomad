import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'kv_store'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('key').unique().notNullable()
      table.text('value').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}