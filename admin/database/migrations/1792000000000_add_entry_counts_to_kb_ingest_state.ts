import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'kb_ingest_state'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Entry-type census of a ZIM, taken when its indexing starts: how many
      // HTML pages the extractor can index and how many PDF documents it
      // skips. Null for non-ZIM files and for rows written before the census
      // existed. (#1445)
      table.integer('html_entries').unsigned().nullable()
      table.integer('pdf_entries').unsigned().nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('html_entries')
      table.dropColumn('pdf_entries')
    })
  }
}
