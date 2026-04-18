import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.defer(async (db) => {
      const row = await db.from(this.tableName).where('service_name', 'nomad_qdrant').first()
      if (!row) return

      const config = JSON.parse(row.container_config)
      const env: string[] = config.Env ?? []

      if (!env.includes('QDRANT__TELEMETRY_DISABLED=true')) {
        config.Env = [...env, 'QDRANT__TELEMETRY_DISABLED=true']
        await db
          .from(this.tableName)
          .where('service_name', 'nomad_qdrant')
          .update({ container_config: JSON.stringify(config) })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      const row = await db.from(this.tableName).where('service_name', 'nomad_qdrant').first()
      if (!row) return

      const config = JSON.parse(row.container_config)
      config.Env = (config.Env ?? []).filter(
        (e: string) => e !== 'QDRANT__TELEMETRY_DISABLED=true'
      )
      if (config.Env.length === 0) delete config.Env

      await db
        .from(this.tableName)
        .where('service_name', 'nomad_qdrant')
        .update({ container_config: JSON.stringify(config) })
    })
  }
}
