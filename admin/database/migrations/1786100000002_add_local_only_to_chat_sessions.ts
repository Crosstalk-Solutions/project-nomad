import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-chat "local only" flag: every turn of a local-only chat is answered by
 * the Ollama container on this machine, even while a remote AI server
 * (`ai.remoteOllamaUrl`) is configured and reachable. Stored on the session so
 * the choice follows the chat across devices and page loads rather than living
 * in one browser. Defaults to false, so existing chats behave as before.
 */
export default class extends BaseSchema {
  protected tableName = 'chat_sessions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('local_only').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('local_only')
    })
  }
}
