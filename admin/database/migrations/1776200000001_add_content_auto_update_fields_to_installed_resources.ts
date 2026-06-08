import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'installed_resources'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // The newest catalog version detected for this resource (a YYYY-MM date
      // stamp), or null when the installed copy is already current. Written by
      // every freshness check (manual or auto) via reconcileResourceUpdateState.
      table.string('available_update_version').nullable()
      // Size of the available update (bytes), captured from the catalog so the
      // status UI and the per-window data-cap selection don't need to re-query
      // the mirror on every poll.
      table.bigInteger('available_update_size_bytes').nullable()
      // Cool-off anchor: when the currently-available update was first detected.
      // ZIM/map versions carry no publish date we can trust, so cool-off is
      // measured from first-seen (mirrors the per-app auto-update fields).
      table.timestamp('available_update_first_seen_at').nullable()
      // Per-resource failure backoff so one flapping download self-disables
      // without affecting the rest of the auto-update run.
      table.integer('auto_update_consecutive_failures').notNullable().defaultTo(0)
      table.string('auto_update_disabled_reason', 255).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('available_update_version')
      table.dropColumn('available_update_size_bytes')
      table.dropColumn('available_update_first_seen_at')
      table.dropColumn('auto_update_consecutive_failures')
      table.dropColumn('auto_update_disabled_reason')
    })
  }
}
