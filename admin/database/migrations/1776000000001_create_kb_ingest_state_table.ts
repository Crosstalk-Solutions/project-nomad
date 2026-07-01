import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'kb_ingest_state'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      // utf8mb4 caps an indexed varchar at 768 chars (3072 byte InnoDB key limit);
      // 512 leaves headroom and is plenty for any NOMAD-managed file path.
      table.string('file_path', 512).notNullable().unique()
      table
        .enum('state', ['pending_decision', 'indexed', 'browse_only', 'failed', 'stalled'])
        .notNullable()
        .defaultTo('pending_decision')
      table.integer('chunks_embedded').notNullable().defaultTo(0)
      table.text('last_error').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
