import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.defer(async (db) => {
      await db
        .from(this.tableName)
        .where('service_name', 'nomad_kiwix_server')
        .whereRaw('`container_command` LIKE ?', ['%*.zim%'])
        .update({
          container_command: '--library /data/kiwix-library.xml --monitorLibrary --address=all',
        })
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from(this.tableName)
        .where('service_name', 'nomad_kiwix_server')
        .where('container_command', '--library /data/kiwix-library.xml --monitorLibrary --address=all')
        .update({
          container_command: '*.zim --address=all',
        })
    })
  }
}
