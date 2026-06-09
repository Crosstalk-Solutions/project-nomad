import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddVisibilityAndIconFieldsToMapMarkers extends BaseSchema {
  protected tableName = 'map_markers'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('custom_color', 7).nullable()
      table.string('icon', 50).nullable()
      table.string('icon_color', 7).nullable()
      table.boolean('visible').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('custom_color')
      table.dropColumn('icon')
      table.dropColumn('icon_color')
      table.dropColumn('visible')
    })
  }
}
