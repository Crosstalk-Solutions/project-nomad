import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'chat_messages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // TEXT tops out at 64 KB, so a long pasted document or a long answer
      // failed to save. MEDIUMTEXT holds 16 MB; the add-message validator caps
      // content well below that.
      table.text('content', 'mediumtext').notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('content').notNullable().alter()
    })
  }
}
