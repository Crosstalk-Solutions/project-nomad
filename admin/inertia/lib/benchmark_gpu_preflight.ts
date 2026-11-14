import type { BenchmarkType } from '../../types/benchmark.js'
import type { GpuHealthStatus } from '../../types/system.js'

/**
 * Whether to warn before starting a benchmark because the host has a GPU the AI
 * Assistant can't reach (#1083).
 *
 * When GPU passthrough is lost (#755), Ollama silently falls back to CPU, so the
 * AI half of the benchmark scores far lower than the hardware deserves and the
 * user only finds out after waiting minutes for it to finish. Only runs that
 * include AI inference ('full' and 'ai') are affected; 'system' never touches
 * the GPU.
 *
 * Only 'passthrough_failed' warns. 'ok', 'no_gpu' and 'ollama_not_installed' are
 * accurate as-is (the AI-installed gate is handled separately), and a missing
 * gpuHealth (system info still loading or the check failed) must not block the
 * user on a guess.
 */
export function shouldWarnGpuBeforeBenchmark(
  type: BenchmarkType,
  gpuHealth: Pick<GpuHealthStatus, 'status'> | null | undefined
): boolean {
  if (type === 'system') return false
  return gpuHealth?.status === 'passthrough_failed'
}
