import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('source_repo', 255).nullable()
      table.string('available_update_version', 50).nullable()
      table.timestamp('update_checked_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('source_repo')
      table.dropColumn('available_update_version')
      table.dropColumn('update_checked_at')
    })
  }
}
