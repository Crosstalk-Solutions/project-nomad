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
>

// Slim version for lists
export type BenchmarkResultSlim = Pick<
  BenchmarkResult,
  | 'id'
  | 'benchmark_id'
  | 'benchmark_type'
  | 'nomad_score'
  | 'submitted_to_repository'
  | 'created_at'
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

// Progress update for real-time feedback
export type BenchmarkProgress = {
  status: BenchmarkStatus
  progress: number
  message: string
  current_stage: string
  timestamp: string
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
