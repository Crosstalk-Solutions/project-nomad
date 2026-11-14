import { BaseSchema } from '@adonisjs/lucid/schema'

// Put every existing pin into the default layer (#1387). MySQL commits each DDL
// statement on its own, so each step checks the real state: add the column as
// nullable, backfill, then tighten it to NOT NULL and add the foreign key.
export default class extends BaseSchema {
  protected tableName = 'map_markers'

  async up() {
    if (!(await this.schema.hasColumn(this.tableName, 'layer_id'))) {
      this.schema.alterTable(this.tableName, (table) => {
        table.integer('layer_id').unsigned().nullable()
      })
    }

    this.defer(async (db) => {
      const defaultLayer = await db
        .from('marker_layers')
        .select('id')
        .orderBy('sort_order', 'asc')
        .orderBy('id', 'asc')
        .first()
      if (!defaultLayer) {
        throw new Error('marker_layers has no default layer to assign existing pins to')
      }
      await db.from(this.tableName).whereNull('layer_id').update({ layer_id: defaultLayer.id })

      await db.rawQuery('ALTER TABLE `map_markers` MODIFY `layer_id` INT UNSIGNED NOT NULL')

      const fk = await db.rawQuery(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'map_markers'
            AND COLUMN_NAME = 'layer_id' AND REFERENCED_TABLE_NAME = 'marker_layers'`
      )
      if (fk[0].length === 0) {
        await db.rawQuery(
          'ALTER TABLE `map_markers` ADD CONSTRAINT `map_markers_layer_id_foreign` ' +
            'FOREIGN KEY (`layer_id`) REFERENCES `marker_layers` (`id`) ON DELETE CASCADE'
        )
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['layer_id'])
      table.dropColumn('layer_id')
    })
  }
}
