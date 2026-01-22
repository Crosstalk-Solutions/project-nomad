import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('powered_by').nullable()
      table.integer('display_order').nullable().defaultTo(100)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('powered_by')
      table.dropColumn('display_order')
    })
  }
}
