import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('service_name')
      table.string('container_image')
      table.string('container_command')
      table.json('container_config').nullable()
      table.boolean('installed').defaultTo(false)
      table.string('ui_location')
      table.json('metadata').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}