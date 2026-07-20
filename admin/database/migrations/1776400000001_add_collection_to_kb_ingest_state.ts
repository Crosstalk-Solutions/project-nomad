import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'kb_ingest_state'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('collection').nullable().index()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('collection')
    })
  }
}
