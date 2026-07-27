import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { BenchmarkType, DiskType } from '../../types/benchmark.js'

export default class BenchmarkResult extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare benchmark_id: string

  @column()
  declare benchmark_type: BenchmarkType

  // Hardware information
  @column()
  declare cpu_model: string

  @column()
  declare cpu_cores: number

  @column()
  declare cpu_threads: number

  @column()
  declare ram_bytes: number

  @column()
  declare disk_type: DiskType

  @column()
  declare gpu_model: string | null

  // System benchmark scores
  @column()
  declare cpu_score: number

  @column()
  declare memory_score: number

  @column()
  declare disk_read_score: number

  @column()
  declare disk_write_score: number

  // AI benchmark scores (nullable for system-only benchmarks)
  @column()
  declare ai_tokens_per_second: number | null

  @column()
  declare ai_model_used: string | null

  @column()
  declare ai_time_to_first_token: number | null

  // Harness forensic metadata (nullable — added in Score v2 Phase 1)
  @column()
  declare sysbench_digest: string | null

  @column()
  declare ollama_version: string | null

  // Platform metadata (nullable). Sourced from the Docker daemon, not
  // systeminformation: inside the admin container si.osInfo()/os.arch()
  // describe the container, not the host.
  @column()
  declare cpu_architecture: string | null

  @column()
  declare os_name: string | null

  @column()
  declare os_version: string | null

  // NOMAD Score v2 raw channels (nullable — added in Score v2 Phase 4). Populated
  // on full benchmarks under benchmark_version >= 2.0.0; the leaderboard recomputes
  // the score from these on submit. cpu_events_multi is measured at
  // cpu_benchmark_threads; memory_ops_per_sec at memory_threads. Disk figures are
  // O_DIRECT MB/s. cpu_total_events/cpu_total_time are the W6 consistency companions.
  @column()
  declare cpu_events_single: number | null

  @column()
  declare cpu_events_multi: number | null

  @column()
  declare cpu_benchmark_threads: number | null

  @column()
  declare cpu_total_events: number | null

  @column()
  declare cpu_total_time: number | null

  @column()
  declare memory_ops_per_sec: number | null

  @column()
  declare memory_threads: number | null

  @column()
  declare disk_read_mb_per_sec: number | null

  @column()
  declare disk_write_mb_per_sec: number | null

  // Uncapped NOMAD Score v2 (null for pre-v2 rows and system-only runs). The
  // legacy nomad_score below is retained in parallel for display continuity.
  // columnName + serializeAs pinned: the snake_case strategy would otherwise map
  // this property to `nomad_score_v_2` (splitting the digit) for both the DB column
  // (which the migration doesn't create) and the JSON key (which the frontend reads
  // as nomad_score_v2). Pin both so DB, API, and UI all agree.
  @column({ columnName: 'nomad_score_v2', serializeAs: 'nomad_score_v2' })
  declare nomad_score_v2: number | null

  // Best-effort run environment metadata (issue #1016)
  @column()
  declare run_environment: string | null

  @column()
  declare storage_path_type: string | null

  @column({
    // Nullable tri-state; coerce the SQLite 0/1 int to a real boolean when present.
    consume: (value: number | null) => (value === null || value === undefined ? null : Boolean(value)),
  })
  declare gpu_compute_detected: boolean | null

  // Composite NOMAD score (0-100)
  @column()
  declare nomad_score: number

  // Repository submission tracking
  @column({
    serialize(value) {
      return Boolean(value)
    },
  })
  declare submitted_to_repository: boolean

  @column.dateTime()
  declare submitted_at: DateTime | null

  @column()
  declare repository_id: string | null

  @column()
  declare builder_tag: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}
