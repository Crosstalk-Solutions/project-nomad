import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'custom_library_sources'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('name', 100).notNullable()
      table.string('base_url', 2048).notNullable()
      table.boolean('is_default').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    // Seed default Kiwix mirrors
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const defaults = [
      { name: 'Debian CDN (Global)', base_url: 'https://cdimage.debian.org/mirror/kiwix.org/zim/' },
      { name: 'Your.org (US)', base_url: 'https://ftpmirror.your.org/pub/kiwix/zim/' },
      { name: 'FAU Erlangen (DE)', base_url: 'https://ftp.fau.de/kiwix/zim/' },
      { name: 'Dotsrc (DK)', base_url: 'https://mirrors.dotsrc.org/kiwix/zim/' },
      { name: 'MirrorService (UK)', base_url: 'https://www.mirrorservice.org/sites/download.kiwix.org/zim/' },
    ]

    for (const d of defaults) {
      await this.defer(async (db) => {
        await db.table(this.tableName).insert({
          name: d.name,
          base_url: d.base_url,
          is_default: true,
          created_at: now,
          updated_at: now,
        })
      })
    }
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
