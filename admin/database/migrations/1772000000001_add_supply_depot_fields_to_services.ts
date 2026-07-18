import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_custom').notNullable().defaultTo(false)
      table.string('category').nullable()
    })

    // Backfill categories for existing curated services
    this.defer(async (db) => {
      const updates: Array<{ service_name: string; category: string }> = [
        { service_name: 'nomad_kiwix_server', category: 'education' },
        { service_name: 'nomad_kolibri', category: 'education' },
        { service_name: 'nomad_ollama', category: 'ai' },
        { service_name: 'nomad_cyberchef', category: 'utility' },
        { service_name: 'nomad_flatnotes', category: 'productivity' },
      ]

      for (const { service_name, category } of updates) {
        await db.from('services').where('service_name', service_name).update({ category })
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_custom')
      table.dropColumn('category')
    })
  }
}
