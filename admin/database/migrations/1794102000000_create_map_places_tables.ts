import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Offline place search (#1574): named features read from the downloaded region .pmtiles files,
 * plus one row per file recording whether (and from which version of the file) it was indexed.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('map_place_indexes', (table) => {
      table.increments('id')
      table.string('file', 255).notNullable().unique()
      // Size + mtime identify the file version that was indexed; a replaced file is re-indexed.
      table.bigInteger('file_size').notNullable()
      table.bigInteger('file_mtime_ms').notNullable()
      // MapPlaceIndexService.INDEX_VERSION the file was indexed with; bumping it re-indexes all.
      table.smallint('index_version').unsigned().notNullable().defaultTo(0)
      table.enum('status', ['indexing', 'ready', 'failed']).notNullable()
      table.integer('places_count').unsigned().notNullable().defaultTo(0)
      table.string('error', 500).nullable()
      table.timestamp('indexed_at').nullable()
    })

    this.schema.createTable('map_places', (table) => {
      table.bigIncrements('id')
      table.string('file', 255).notNullable().index()
      table.string('name', 255).notNullable()
      table.string('name_en', 255).nullable()
      table.string('layer', 16).notNullable()
      table.string('kind', 64).notNullable()
      table.tinyint('importance').unsigned().notNullable()
      table.double('lat').notNullable()
      table.double('lng').notNullable()
      // foldText(name + name_en): lowercase, no diacritics. InnoDB FULLTEXT does not fold
      // accents even under an _ai_ci collation, so folding happens in the app on both sides.
      table.string('search_text', 512).notNullable()
      table.index(['search_text'], 'map_places_search_text_fulltext', { indexType: 'FULLTEXT' })
    })
  }

  async down() {
    this.schema.dropTable('map_places')
    this.schema.dropTable('map_place_indexes')
  }
}
