import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'zim_file_metadata'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('filename').notNullable().unique()
      table.string('title').notNullable()
      table.text('summary').nullable()
      table.string('author').nullable()
      table.bigInteger('size_bytes').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
