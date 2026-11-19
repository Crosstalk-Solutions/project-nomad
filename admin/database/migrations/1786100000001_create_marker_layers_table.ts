import { BaseSchema } from '@adonisjs/lucid/schema'

// Map pin layers (#1387). Every pin belongs to exactly one layer; "My Pins" is
// created here so existing pins have somewhere to go.
export default class extends BaseSchema {
  protected tableName = 'marker_layers'

  async up() {
    if (!(await this.schema.hasTable(this.tableName))) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id')
        table.string('name', 100).notNullable()
        table.boolean('visible').notNullable().defaultTo(true)
        table.integer('sort_order').notNullable().defaultTo(0)
        table.timestamp('created_at')
        table.timestamp('updated_at')
      })
    }

    this.defer(async (db) => {
      const existing = await db.from(this.tableName).count('* as total').first()
      if (Number(existing?.total ?? 0) === 0) {
        const now = new Date()
        await db.table(this.tableName).insert({
          name: 'My Pins',
          visible: true,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        })
      }
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
