import { BaseSchema } from '@adonisjs/lucid/schema'
import { SERVICE_NAMES } from '../../constants/service_names.js'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    // Repair installs hit by #1581. Before the fix, editing the AI Assistant replaced its "/chat"
    // ui_location with the first host port (Ollama's API on 11434), or with null when every port was
    // removed. The edit also set is_user_modified, so the seeder skips the row and never restores it.
    // The AI Assistant's UI is NOMAD's own /chat route regardless of Ollama's ports, so forcing it back
    // is safe and leaves container_config alone.
    this.defer(async (db) => {
      await db
        .from(this.tableName)
        .where('service_name', SERVICE_NAMES.OLLAMA)
        .where((query) => {
          query.whereNull('ui_location').orWhereNot('ui_location', '/chat')
        })
        .update({ ui_location: '/chat' })
    })
  }

  async down() {
    // One-way data repair: the overwritten port value pointed at the wrong place, so nothing to restore.
  }
}
