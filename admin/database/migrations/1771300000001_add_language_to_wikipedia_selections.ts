import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'wikipedia_selections'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('language', 5).defaultTo('en')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('language')
    })
  }
}
