import BenchmarkResult from '#models/benchmark_result'

// Benchmark type identifiers
export type BenchmarkType = 'full' | 'system' | 'ai'

// Benchmark execution status
export type BenchmarkStatus =
  | 'idle'
  | 'starting'
  | 'detecting_hardware'
  | 'running_cpu'
  | 'running_memory'
  | 'running_disk_read'
  | 'running_disk_write'
  | 'downloading_ai_model'
  | 'running_ai'
  | 'calculating_score'
  | 'completed'
  | 'error'

// Hardware detection types
export type DiskType = 'ssd' | 'hdd' | 'nvme' | 'unknown'

export type HardwareInfo = Pick<
  BenchmarkResult,
  'cpu_model' | 'cpu_cores' | 'cpu_threads' | 'ram_bytes' | 'disk_type' | 'gpu_model'
>

// Individual benchmark scores
export type SystemScores = Pick<
  BenchmarkResult,
  'cpu_score' | 'memory_score' | 'disk_read_score' | 'disk_write_score'
>

export type AIScores = Pick<
  BenchmarkResult,
  'ai_tokens_per_second' | 'ai_model_used' | 'ai_time_to_first_token'
> & {
  // Forensic metadata: Ollama server version at benchmark time (null if /api/version unavailable)
  ai_ollama_version?: string | null
}

// Slim version for lists
export type BenchmarkResultSlim = Pick<
  BenchmarkResult,
  | 'id'
  | 'benchmark_id'
  | 'benchmark_type'
  | 'nomad_score'
  | 'submitted_to_repository'
  | 'created_at'
  | 'builder_tag'
> & {
  cpu_model: string
  gpu_model: string | null
}

// Benchmark settings key-value store
export type BenchmarkSettingKey =
  | 'allow_anonymous_submission'
  | 'installation_id'
  | 'last_benchmark_run'

export type BenchmarkSettings = {
  allow_anonymous_submission: boolean
  installation_id: string | null
  last_benchmark_run: string | null
}

// A single stage in the ordered run plan (drives the frontend stage rail)
export type BenchmarkStageDescriptor = {
  status: BenchmarkStatus
  label: string
}

// The raw metric produced when a stage finishes, surfaced to the live UI
export type BenchmarkPartialResult = {
  status: BenchmarkStatus
  label: string
  value: number
  unit: string
}

// Progress update for real-time feedback
export type BenchmarkProgress = {
  status: BenchmarkStatus
  progress: number
  message: string
  current_stage: string
  timestamp: string
  // The ordered stage plan for this run + where we are in it. Optional so old
  // clients / payloads without these fields still render.
  stages?: BenchmarkStageDescriptor[]
  stage_index?: number
  stage_count?: number
  // Raw result of the stage that just completed (fills the "results so far" strip)
  partial_result?: BenchmarkPartialResult
}

// High-rate live telemetry sample broadcast during a run (1-2 Hz)
export type BenchmarkTelemetry = {
  benchmark_id: string | null
  status: BenchmarkStatus
  t: number // ms since run start
  cpu: {
    overall: number // 0-100
    per_core: number[] // 0-100 per host thread
  }
  temp_c: number | null // null when host sensors are unavailable
  disk: {
    read_mb_s: number
    write_mb_s: number
  }
  // In-test metric injected by the active stage (e.g. live AI tokens/sec)
  stage_metric?: {
    kind: 'tokens_per_sec' | 'events_per_sec' | 'mib_s'
    value: number
    ttft_ms?: number
  }
  // NVIDIA GPU stats sampled during the AI stage (absent when no NVIDIA GPU)
  gpu?: { util: number; vram_used_mb: number; vram_total_mb: number }
}

// API request types
export type RunBenchmarkParams = {
  benchmark_type: BenchmarkType
}

export type SubmitBenchmarkParams = {
  benchmark_id?: string
}

// API response types
export type RunBenchmarkResponse = {
  success: boolean
  job_id: string
  benchmark_id: string
  message: string
}

export type BenchmarkResultsResponse = {
  results: BenchmarkResult[]
  total: number
}

export type SubmitBenchmarkResponse = {
  success: true
  repository_id: string
  percentile: number
} | {
  success: false
  error: string
}

export type UpdateBuilderTagResponse = {
  success: true,
  builder_tag: string | null
} | {
  success: false,
  error: string
}

// NOMAD Score v2 raw channels captured from a full benchmark run (all present
// and > 0). cpu_events_multi is measured at cpu_benchmark_threads; memory at
// memory_threads; disk figures are O_DIRECT MB/s. total_events/total_time are the
// W6 consistency companions from the multi-thread CPU pass.
export type SystemBenchmarkRawsV2 = {
  cpu_events_single: number
  cpu_events_multi: number
  cpu_benchmark_threads: number
  cpu_total_events: number
  cpu_total_time: number
  memory_ops_per_sec: number
  memory_threads: number
  disk_read_mb_per_sec: number
  disk_write_mb_per_sec: number
}

// Result of a system benchmark pass: the legacy 0-1 sub-scores (v1) plus the v2
// raw channels, both derived from the same sysbench runs.
export type SystemBenchmarkOutput = {
  scores: SystemScores
  raws: SystemBenchmarkRawsV2
}

// Best-effort run-environment metadata (issue #1016). Any field may be null when
// detection fails; none of them gate a submission.
export type RunEnvironmentInfo = {
  run_environment: string | null
  storage_path_type: string | null
  gpu_compute_detected: boolean | null
  cpu_architecture: string | null
  os_name: string | null
  os_version: string | null
}

// Central repository submission payload (privacy-first)
export type RepositorySubmission = Pick<
  BenchmarkResult,
  | 'cpu_model'
  | 'cpu_cores'
  | 'cpu_threads'
  | 'disk_type'
  | 'gpu_model'
  | 'cpu_score'
  | 'memory_score'
  | 'disk_read_score'
  | 'disk_write_score'
  | 'ai_tokens_per_second'
  | 'ai_time_to_first_token'
  | 'nomad_score'
> & {
  nomad_version: string
  benchmark_version: string
  ram_gb: number
  builder_tag: string | null // null = anonymous submission
}

// NOMAD Score v2 submission payload. Mirrors the leaderboard's submitValidatorV2
// exactly: raw channels in (server recomputes the score), required test params +
// W6 companions + provenance, optional environment metadata. ai_time_to_first_token
// is in SECONDS here (the server treats it as seconds); the client stores TTFT in
// ms, so submitToRepository divides by 1000.
export type RepositorySubmissionV2 = {
  // Hardware
  cpu_model: string
  cpu_cores: number
  cpu_threads: number
  ram_gb: number
  disk_type: DiskType
  gpu_model: string | null
  // Scored raw channels (all required, > 0)
  ai_tokens_per_second: number
  cpu_events_single: number
  cpu_events_multi: number
  memory_ops_per_sec: number
  disk_read_mb_per_sec: number
  disk_write_mb_per_sec: number
  // Test parameters
  cpu_benchmark_threads: number
  memory_threads: number
  // Metadata channel (weight 0) + W6 consistency companions
  ai_time_to_first_token: number // seconds
  cpu_total_events: number
  cpu_total_time: number
  // Provenance (required)
  ollama_version: string
  sysbench_digest: string
  // Environment metadata (best-effort)
  run_environment?: string
  storage_path_type?: string
  gpu_compute_detected?: boolean
  // Platform metadata. cpu_architecture is what makes a single cross-ISA
  // leaderboard honest — without it an ARM result is indistinguishable from x86.
  cpu_architecture?: string
  os_name?: string
  os_version?: string
  // Benchmark metadata (shared with v1)
  nomad_version: string
  benchmark_version: string
  builder_tag?: string
}

// Central repository response types
export type RepositorySubmitResponse = {
  success: boolean
  repository_id: string
  percentile: number
}

export type RepositoryStats = {
  total_submissions: number
  average_score: number
  median_score: number
  top_score: number
  percentiles: {
    p10: number
    p25: number
    p50: number
    p75: number
    p90: number
  }
}

export type LeaderboardEntry = Pick<BenchmarkResult, 'cpu_model' | 'gpu_model' | 'nomad_score'> & {
  rank: number
  submitted_at: string
}

export type ComparisonResponse = {
  matching_submissions: number
  average_score: number
  your_percentile: number | null
}

// Score calculation weights (for reference in UI)
export type ScoreWeights = {
  ai_tokens_per_second: number
  cpu: number
  memory: number
  ai_ttft: number
  disk_read: number
  disk_write: number
}

// Default weights as defined in plan
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  ai_tokens_per_second: 0.3,
  cpu: 0.25,
  memory: 0.15,
  ai_ttft: 0.1,
  disk_read: 0.1,
  disk_write: 0.1,
}

// Benchmark job parameters
export type RunBenchmarkJobParams = {
  benchmark_id: string
  benchmark_type: BenchmarkType
  include_ai: boolean
}

// sysbench result parsing types
export type SysbenchCpuResult = {
  events_per_second: number
  total_time: number
  total_events: number
}

export type SysbenchMemoryResult = {
  operations_per_second: number
  transfer_rate_mb_per_sec: number
  total_time: number
}

export type SysbenchDiskResult = {
  reads_per_second: number
  writes_per_second: number
  read_mb_per_sec: number
  write_mb_per_sec: number
  total_time: number
}
