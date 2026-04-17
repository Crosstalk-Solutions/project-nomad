import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'map_markers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.double('longitude').notNullable()
      table.double('latitude').notNullable()
      table.string('color', 20).notNullable().defaultTo('orange')
      table.string('marker_type', 20).notNullable().defaultTo('pin')
      table.string('route_id').nullable()
      table.integer('route_order').nullable()
      table.text('notes').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
