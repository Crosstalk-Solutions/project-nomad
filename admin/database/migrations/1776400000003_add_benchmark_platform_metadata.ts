import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'benchmark_results'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Platform metadata (Score v2). The leaderboard is a single board across
      // instruction sets by design, with disclosure as the fairness mechanism —
      // without an architecture field an ARM result is indistinguishable from an
      // x86 one, which is exactly what the disclosure is meant to prevent.
      //
      // All sourced from the Docker daemon rather than systeminformation, because
      // si.osInfo()/os.arch() inside the admin container describe the CONTAINER,
      // not the host. Nullable — pre-existing rows simply leave them empty.
      table.string('cpu_architecture').nullable()
      table.string('os_name').nullable()
      table.string('os_version').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('cpu_architecture')
      table.dropColumn('os_name')
      table.dropColumn('os_version')
    })
  }
}
