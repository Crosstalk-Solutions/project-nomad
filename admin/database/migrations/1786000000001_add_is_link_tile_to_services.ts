import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Marks a row that is only a dashboard shortcut: a name, an icon and a URL,
      // with no container behind it. Distinct from is_custom, which still means a
      // user-defined container NOMAD installs and manages. A link tile has no
      // image, no ports and no lifecycle, so the UI must not offer Start, Stop,
      // Update or Uninstall for one.
      table.boolean('is_link_tile').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_link_tile')
    })
  }
}
