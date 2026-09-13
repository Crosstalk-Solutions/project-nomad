/**
 * Pure helpers for classifying which compute backend Ollama actually loaded,
 * parsed from its container logs. Extracted so both SystemService (GPU health
 * display) and GpuPassthroughRemediationProvider (auto-reinstall decision) share
 * one source of truth, and so the logic is unit-testable without Docker.
 *
 * Ollama writes one `inference compute` log line per detected device a few seconds
 * after startup, e.g.:
 *   GPU:  ... msg="inference compute" id=0 library=CUDA compute=12.1 name=CUDA0 description="NVIDIA GB10" ...
 *   CPU:  ... msg="inference compute" id=cpu library=cpu compute="" name=cpu ...
 */

export type OllamaComputeBackend = 'gpu' | 'cpu' | 'unknown'

const INFERENCE_LINE_MARKER = 'msg="inference compute"'
const GPU_LIBRARY_RE = /library=(CUDA|ROCm|Vulkan)\b/

/**
 * Classify Ollama's compute backend from raw container log text.
 *
 * - 'gpu'     if any `inference compute` line reports a GPU backend
 *             (CUDA/ROCm/Vulkan). Ollama may emit a CPU line alongside a GPU
 *             line (CPU is always listed as a fallback device), so a GPU line
 *             anywhere means the GPU is usable.
 * - 'cpu'     if `inference compute` lines exist but none report a GPU backend —
 *             i.e. Ollama fell back to / was created with CPU only.
 * - 'unknown' if no `inference compute` line is present (container too fresh,
 *             logs rotated, or Ollama not started).
 */
export function classifyOllamaComputeBackend(logText: string): OllamaComputeBackend {
  const lines = logText.split('\n').filter((line) => line.includes(INFERENCE_LINE_MARKER))
  if (lines.length === 0) return 'unknown'

  if (lines.some((line) => GPU_LIBRARY_RE.test(line))) return 'gpu'

  // Lines exist but none matched a GPU library. A `library=cpu` line is a
  // definitive CPU fallback; anything else (unrecognized library) stays unknown.
  if (lines.some((line) => /library=cpu\b/.test(line))) return 'cpu'

  return 'unknown'
}
