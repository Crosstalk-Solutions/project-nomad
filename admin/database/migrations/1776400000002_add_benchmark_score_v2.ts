import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'benchmark_results'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // NOMAD Score v2 (Phase 4): raw channel values the leaderboard scores from,
      // the frozen test parameters, the W6 consistency companions, the uncapped
      // score, and best-effort run-environment metadata (#1016). All nullable —
      // pre-v2 rows and system-only runs simply leave them empty.
      // double (not float): Knex's MySQL float is float(8,2) — max 999999.99 and
      // rounded to 2 decimals. memory_ops_per_sec / cpu_total_events run into the
      // millions, and rounding raws would break byte-match with the leaderboard's
      // server-side score recompute. double holds full-precision large values.
      table.double('cpu_events_single').nullable()
      table.double('cpu_events_multi').nullable()
      table.integer('cpu_benchmark_threads').nullable()
      table.double('cpu_total_events').nullable()
      table.double('cpu_total_time').nullable()
      table.double('memory_ops_per_sec').nullable()
      table.integer('memory_threads').nullable()
      table.double('disk_read_mb_per_sec').nullable()
      table.double('disk_write_mb_per_sec').nullable()
      table.double('nomad_score_v2').nullable()
      table.string('run_environment').nullable()
      table.string('storage_path_type').nullable()
      table.boolean('gpu_compute_detected').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('cpu_events_single')
      table.dropColumn('cpu_events_multi')
      table.dropColumn('cpu_benchmark_threads')
      table.dropColumn('cpu_total_events')
      table.dropColumn('cpu_total_time')
      table.dropColumn('memory_ops_per_sec')
      table.dropColumn('memory_threads')
      table.dropColumn('disk_read_mb_per_sec')
      table.dropColumn('disk_write_mb_per_sec')
      table.dropColumn('nomad_score_v2')
      table.dropColumn('run_environment')
      table.dropColumn('storage_path_type')
      table.dropColumn('gpu_compute_detected')
    })
  }
}
