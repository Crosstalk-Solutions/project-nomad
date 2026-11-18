import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'benchmark_results'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Whether the AI portion ran against a remote host, recorded when the run
      // happened. Submission used to read the setting at submit time, so changing
      // it between running and sharing mis-attributed the result. Null for rows
      // from before this column and for runs where the AI stage did not run.
      table.boolean('ai_remote').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('ai_remote')
    })
  }
}
