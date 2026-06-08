import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // User-set override for an app's launch ("Open") link, used when the instance sits behind a
      // reverse proxy or local DNS (e.g. https://jellyfin.myhomelab.net). When null, the default
      // host + port link (derived from ui_location) is used. Stored separately from ui_location so
      // the default is always recoverable, and deliberately NOT synced by the service seeder so a
      // curated app's override survives reseeds/upgrades.
      table.string('custom_url').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('custom_url')
    })
  }
}
