import type Docker from 'dockerode'
import { mapGfxToHsaOverride, readHsaOverrideFromEnv } from '../utils/amd_hsa_override.js'

/**
 * Pure helpers for classifying which compute backend Ollama actually loaded,
 * parsed from its container logs. Extracted so both SystemService (GPU health
 * display) and GpuPassthroughRemediationProvider (auto-reinstall decision) share
 * one source of truth, and so the logic is unit-testable without Docker.
 * readOllamaStartupLogs is the one Docker-facing helper, kept here so both
 * callers read the same log window.
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

export type OllamaGpuLibrary = 'CUDA' | 'ROCm' | 'Vulkan'

export type OllamaGpuInfo = {
  library: OllamaGpuLibrary
  name: string
  vramMiB: number
}

/**
 * Parse the GPU device Ollama reported at startup, or null when no GPU line is
 * present. Takes the first GPU line rather than the last `inference compute`
 * line: Ollama also lists a CPU fallback device, and when that line lands last
 * a working GPU would otherwise read as no GPU at all.
 */
export function parseOllamaGpuFromLogs(logText: string): OllamaGpuInfo | null {
  const line = logText
    .split('\n')
    .find((l) => l.includes(INFERENCE_LINE_MARKER) && GPU_LIBRARY_RE.test(l))
  if (!line) return null

  const library = line.match(GPU_LIBRARY_RE)![1] as OllamaGpuLibrary
  const descMatch = line.match(/description="([^"]+)"/)
  const totalMatch = line.match(/total="([0-9.]+)\s*GiB"/)
  const fallbackName = library === 'CUDA' ? 'NVIDIA GPU' : library === 'ROCm' ? 'AMD GPU' : 'GPU'

  return {
    library,
    name: descMatch?.[1] || fallbackName,
    vramMiB: totalMatch ? Math.round(Number.parseFloat(totalMatch[1]) * 1024) : 0,
  }
}

export type GpuVendor = 'nvidia' | 'amd'

/**
 * The subset of `docker inspect nomad_ollama` the GPU checks read. Structural so
 * dockerode's ContainerInspectInfo satisfies it and tests can pass plain objects.
 */
export type OllamaContainerSnapshot = {
  Config?: { Image?: string; Env?: string[] | null }
  HostConfig?: {
    Devices?: Array<{ PathOnHost?: string }> | null
    DeviceRequests?: Array<{ Driver?: string }> | null
  }
}

function hasDevice(container: OllamaContainerSnapshot, path: string): boolean {
  return (container.HostConfig?.Devices ?? []).some((d) => d.PathOnHost === path)
}

// Matches rocm in the tag only (ollama/ollama:rocm, :0.12.0-rocm), not the repo path.
function isRocmImage(image: string | undefined): boolean {
  return /:[^/:]*rocm[^/:]*$/i.test(image ?? '')
}

/**
 * Which GPU vendor, if any, Ollama is expected to run on.
 *
 * The container's own config comes first because it records what the install
 * actually set up, independent of how the host is detected today:
 *   - an nvidia DeviceRequest means NVIDIA
 *   - a ROCm image tag or a /dev/kfd device means AMD (/dev/dri alone is not
 *     AMD-specific, Intel and Vulkan setups pass it too)
 * A registered nvidia runtime comes next, which covers a container created
 * CPU-only before the runtime was added.
 *
 * The persisted AMD GPU type counts only when no container exists. An AMD
 * container without ROCm config is deliberate: either acceleration was turned
 * off, or the daemon rejected /dev/kfd and the install fell back to CPU (#1232).
 * Flagging it would offer a reinstall that rebuilds the same CPU container. AMD
 * never registers a Docker runtime, so gating on the runtime alone skips every
 * AMD box (#1344).
 */
export function resolveExpectedGpuVendor(input: {
  hasNvidiaRuntime: boolean
  amdConfigured: boolean
  container: OllamaContainerSnapshot | null
}): GpuVendor | null {
  const { container } = input
  if (container) {
    if ((container.HostConfig?.DeviceRequests ?? []).some((r) => r.Driver === 'nvidia')) {
      return 'nvidia'
    }
    if (isRocmImage(container.Config?.Image) || hasDevice(container, '/dev/kfd')) {
      return 'amd'
    }
  }
  if (input.hasNvidiaRuntime) return 'nvidia'
  if (!container && input.amdConfigured) return 'amd'
  return null
}

/**
 * Where a running AMD nomad_ollama container differs from what a reinstall would
 * create. An empty list means a reinstall would rebuild the same container, so it
 * cannot move Ollama off the CPU and the fix lies elsewhere (usually the HSA
 * override for an iGPU missing from ROCm's allowlist).
 */
export function diffAmdOllamaConfig(
  container: OllamaContainerSnapshot,
  desiredHsaOverride: string | null
): string[] {
  const drift: string[] = []
  const env = container.Config?.Env ?? []

  if (!isRocmImage(container.Config?.Image)) {
    drift.push(`image is ${container.Config?.Image ?? 'unknown'}, not the ROCm build`)
  }
  if (!hasDevice(container, '/dev/kfd')) drift.push('/dev/kfd is not passed through')
  if (!hasDevice(container, '/dev/dri')) drift.push('/dev/dri is not passed through')

  const currentOverride = readHsaOverrideFromEnv(env)
  if (currentOverride !== desiredHsaOverride) {
    drift.push(
      `HSA_OVERRIDE_GFX_VERSION is ${currentOverride ?? 'unset'}, expected ${desiredHsaOverride ?? 'unset'}`
    )
  }
  if (!env.includes('OLLAMA_IGPU_ENABLE=1')) drift.push('OLLAMA_IGPU_ENABLE=1 is not set')

  return drift
}

/**
 * The gfx target Ollama named when it rejected an AMD GPU, e.g. 'gfx1103' from
 *   msg="amdgpu is not supported (supported types:[gfx1030 ...])" gpu_type=gfx1103 ...
 * Best-effort: the exact wording varies across Ollama releases, so callers treat
 * null as "unknown" and fall back to asking the user.
 */
export function parseAmdGfxTargetFromLogs(logText: string): string | null {
  return logText.match(/gpu_type=(gfx[0-9a-f]+)\b/i)?.[1]?.toLowerCase() ?? null
}

/**
 * Why an AMD container expected on the GPU is running on CPU, in the shape
 * GpuHealthStatus reports to the UI. desiredHsaOverride must come from
 * DockerService.getAmdHsaOverride with this container's env, so the diff matches
 * what a reinstall would build.
 */
export function diagnoseAmdCpuFallback(
  container: OllamaContainerSnapshot,
  logText: string,
  desiredHsaOverride: string | null
) {
  const gfx = parseAmdGfxTargetFromLogs(logText)
  const current = readHsaOverrideFromEnv(container.Config?.Env)
  // With an override applied, Ollama logs the coerced target (gfx1100 for a 780M on
  // 11.0.0), which maps to "no override" and would suggest removing a working value.
  // The override the container carries is the better suggestion then (#1377).
  const suggested = current ?? (gfx ? mapGfxToHsaOverride(gfx) : null)
  return {
    amdReinstallWouldChange: diffAmdOllamaConfig(container, desiredHsaOverride).length > 0,
    ...(gfx && { amdGfxTarget: gfx }),
    ...(current && { currentHsaOverride: current }),
    ...(suggested && { suggestedHsaOverride: suggested }),
  }
}

/** How long one startup-log read may take before callers give up on it (#1450). */
export const OLLAMA_STARTUP_LOG_TIMEOUT_MS = 5_000

/** Length of the startup window, in seconds, the "inference compute" line is read from. */
const STARTUP_WINDOW_SEC = 300

/**
 * Whether a startup-log read is final and can be reused for the rest of the
 * container's life. The window is fixed once it has closed, so the read cannot
 * change until the container restarts (which changes StartedAt and so the cache
 * key). A read that already holds the "inference compute" line is final too.
 * An open window without the line is not: Ollama may still be starting up.
 */
export function isStartupLogReadFinal(
  logText: string,
  startedAtSec: number,
  nowMs: number = Date.now()
): boolean {
  if (logText.includes(INFERENCE_LINE_MARKER)) return true
  return nowMs >= (startedAtSec + STARTUP_WINDOW_SEC) * 1000
}

/**
 * Race `promise` against a timer. Resolves to `fallback` when the timer wins;
 * the promise keeps running and is not cancelled.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Startup-log reads keyed by container id + StartedAt. Holds the in-flight
 * promise, not just the result, so a slow read started by one page load is
 * awaited by the next instead of starting a second scan of the same log.
 */
const startupLogReads = new Map<string, Promise<string>>()

/** Test hook: forget every cached startup-log read. */
export function clearOllamaStartupLogCache(): void {
  startupLogReads.clear()
}

/**
 * Read nomad_ollama's logs from its startup window (the five minutes after it
 * booted), where the "inference compute" line is emitted. A tail:N read is
 * fragile here: under embedding load the container writes >1000 lines/min,
 * which pushes the line out of any reasonable tail within minutes, while the
 * startup window is bounded and never ages out. Falls back to tail:500 when
 * StartedAt is missing. Returns '' on any error so callers classify the backend
 * as 'unknown' rather than throwing.
 *
 * With the json-file log driver Docker scans the log file from the start to
 * serve a since/until window, so on a multi-GB Ollama log a single read took
 * close to a minute and hung Settings > System, which awaits it (#1450). Two
 * guards keep that off the request path:
 *   - the read is bounded by OLLAMA_STARTUP_LOG_TIMEOUT_MS; a timeout returns ''
 *     ('unknown'), the same as any other failed read, and
 *   - a final read (see isStartupLogReadFinal) is cached per container start, so
 *     the log is scanned once per container life rather than on every page load.
 *     A read that times out keeps running and lands in the cache when it finishes.
 */
export async function readOllamaStartupLogs(
  container: Docker.Container,
  inspect?: { Id?: string; State?: { StartedAt?: string } },
  timeoutMs: number = OLLAMA_STARTUP_LOG_TIMEOUT_MS
): Promise<string> {
  try {
    const state = inspect ?? (await container.inspect())
    const startedAtRaw = state?.State?.StartedAt
    const startedAtMs = startedAtRaw ? new Date(startedAtRaw).getTime() : NaN

    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
      const read = readLogs(container, { tail: 500 }).catch(() => '')
      return await withTimeout(read, timeoutMs, '')
    }

    const startedAtSec = Math.floor(startedAtMs / 1000)
    const key = `${state?.Id ?? container.id}:${startedAtSec}`
    let read = startupLogReads.get(key)
    if (!read) {
      read = readLogs(container, {
        since: startedAtSec,
        until: startedAtSec + STARTUP_WINDOW_SEC,
      }).then(
        (text) => {
          // Only a final read is worth keeping; anything else is retried next call.
          if (!isStartupLogReadFinal(text, startedAtSec)) startupLogReads.delete(key)
          return text
        },
        () => {
          startupLogReads.delete(key)
          return ''
        }
      )
      startupLogReads.set(key, read)
    }
    return await withTimeout(read, timeoutMs, '')
  } catch {
    return ''
  }
}

/** One non-following Docker logs call over the given window. */
async function readLogs(
  container: Docker.Container,
  window: { since: number; until: number } | { tail: number }
): Promise<string> {
  const buf = (await container.logs({
    stdout: true,
    stderr: true,
    follow: false,
    ...window,
  })) as unknown as Buffer
  return buf.toString('utf8')
}
