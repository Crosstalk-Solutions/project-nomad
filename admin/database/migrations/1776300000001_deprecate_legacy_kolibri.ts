import { BaseSchema } from '@adonisjs/lucid/schema'
import { SERVICE_NAMES } from '../../constants/service_names.js'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    // Generic deprecation flag (reusable for future sunsets): a deprecated service is hidden from
    // the install catalog unless it is already installed — see SystemService.getServices().
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_deprecated').notNullable().defaultTo(false)
    })

    // Sunset the legacy treehouses/kolibri:0.12.8 entry, replaced by the learningequality Gen 2
    // entry seeded as `nomad_kolibri_2`. The seeder is additive + sync-existing and never deletes,
    // so without this step every existing deployment keeps an orphaned `nomad_kolibri` row and can
    // still install the dead 6-year-old image. Conditional handling keeps it data-safe:
    this.defer(async (db) => {
      // Never installed → just an orphaned catalog row; drop it outright.
      await db
        .from(this.tableName)
        .where('service_name', SERVICE_NAMES.KOLIBRI)
        .where('installed', false)
        .delete()

      // Currently installed → a running 0.12.8 container holds port 8300 + a bind mount. Keep the
      // row (it's Nomad's only handle to open/stop/uninstall that container) but flag it deprecated
      // so it shows a "Legacy" badge and drops out of the catalog once the user uninstalls it.
      await db
        .from(this.tableName)
        .where('service_name', SERVICE_NAMES.KOLIBRI)
        .where('installed', true)
        .update({ is_deprecated: true })
    })
  }

  async down() {
    // Note: the legacy-row deletion in up() is a one-way data change and is not restored here.
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_deprecated')
    })
  }
}
