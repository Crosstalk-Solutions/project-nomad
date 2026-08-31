import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Brand-palette colour for a dashboard link tile. Null means the default.
      // A separate migration from the one that added is_link_tile, because that
      // one has already run on the test box; editing it in place would leave
      // fresh installs and upgraded ones with different schemas.
      table.string('link_color', 20).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('link_color')
    })
  }
}
