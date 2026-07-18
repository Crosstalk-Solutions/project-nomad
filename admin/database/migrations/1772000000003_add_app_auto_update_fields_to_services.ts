import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Per-app opt-in for automatic updates (gated additionally by the global
      // `appAutoUpdate.enabled` master switch). Default off — auto-update is opt-in.
      table.boolean('auto_update_enabled').notNullable().defaultTo(false)
      // Cool-off anchor: when the currently-available update was first detected.
      // Registry tags carry no publish date, so cool-off is measured from first-seen.
      table.timestamp('available_update_first_seen_at').nullable()
      // Per-app failure backoff so one flapping app self-disables without affecting others.
      table.integer('auto_update_consecutive_failures').notNullable().defaultTo(0)
      table.string('auto_update_disabled_reason', 255).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('auto_update_enabled')
      table.dropColumn('available_update_first_seen_at')
      table.dropColumn('auto_update_consecutive_failures')
      table.dropColumn('auto_update_disabled_reason')
    })
  }
}
