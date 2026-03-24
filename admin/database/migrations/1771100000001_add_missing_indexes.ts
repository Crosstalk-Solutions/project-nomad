import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('chat_messages', (table) => {
      table.index(['session_id'], 'chat_messages_session_id_index')
    })

    this.schema.alterTable('installed_resources', (table) => {
      table.index(['resource_type'], 'installed_resources_resource_type_index')
    })
  }

  async down() {
    this.schema.alterTable('chat_messages', (table) => {
      table.dropIndex(['session_id'], 'chat_messages_session_id_index')
    })

    this.schema.alterTable('installed_resources', (table) => {
      table.dropIndex(['resource_type'], 'installed_resources_resource_type_index')
    })
  }
}
