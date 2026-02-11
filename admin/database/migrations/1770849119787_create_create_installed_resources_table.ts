import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'installed_resources'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('resource_id').notNullable()
      table.enum('resource_type', ['zim', 'map']).notNullable()
      table.string('collection_ref').nullable()
      table.string('version').notNullable()
      table.string('url').notNullable()
      table.string('file_path').notNullable()
      table.bigInteger('file_size_bytes').nullable()
      table.timestamp('installed_at').notNullable()

      table.unique(['resource_id', 'resource_type'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
