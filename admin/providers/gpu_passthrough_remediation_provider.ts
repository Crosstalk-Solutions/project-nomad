import logger from '@adonisjs/core/services/logger'
import type { ApplicationService } from '@adonisjs/core/types'
import type Docker from 'dockerode'

/**
 * Auto-remediates NVIDIA GPU passthrough loss after admin / host restart.
 *
 * Detects the condition from Ollama's own "inference compute" startup log line:
 * if the NVIDIA container runtime is registered with Docker but Ollama still
 * loaded a CPU-only backend, passthrough is broken and nomad_ollama is recreated.
 * This single signal covers two failure modes:
 *   1. nomad_ollama was created CPU-only because the nvidia runtime was registered
 *      only AFTER the AI Assistant was first installed (DockerService attaches a
 *      GPU DeviceRequest only when 'nvidia' is in docker.info().Runtimes at install
 *      time). Common on a host where the runtime was added later.
 *   2. After an update or container recreate, DeviceRequests still lists the nvidia
 *      driver but the toolkit binding inside the container is torn, and Ollama
 *      silently falls back to CPU.
 *
 * PR #208 added detection + a one-click "Fix: Reinstall AI Assistant" banner; this
 * provider performs that click automatically on admin boot.
 *
 * Guards:
 *   - NVIDIA-only. AMD passthrough_failed has a different fix path (HSA override
 *     handling in PR #804) and is left to the user.
 *   - One-shot per admin boot. The provider runs once on startup; if the recreate
 *     itself fails the banner remains as a fallback.
 *   - Cooldown: will not auto-reinstall more than once within
 *     AUTO_REMEDIATE_COOLDOWN_MS, to avoid a reinstall loop when the GPU cannot be
 *     accelerated (e.g. an architecture Ollama has no kernels for).
 *   - Opt-out via KV `ai.autoFixGpuPassthrough = false`.
 *   - Skipped entirely when no NVIDIA runtime is registered with Docker.
 */
export default class GpuPassthroughRemediationProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    if (this.app.getEnvironment() !== 'web') return

    setImmediate(async () => {
      try {
        const KVStore = (await import('#models/kv_store')).default
        const { DockerService } = await import('#services/docker_service')
        const { SERVICE_NAMES } = await import('../constants/service_names.js')
        const Docker = (await import('dockerode')).default

        const enabledRaw = await KVStore.getValue('ai.autoFixGpuPassthrough')
        if (String(enabledRaw) === 'false') {
          logger.info(
            '[GpuPassthroughRemediationProvider] Auto-fix disabled via KV — skipping.'
          )
          return
        }

        const docker = new Docker({ socketPath: '/var/run/docker.sock' })
        const dockerInfo = await docker.info()
        const runtimes = dockerInfo.Runtimes || {}
        const hasNvidiaRuntime = 'nvidia' in runtimes

        if (!hasNvidiaRuntime) {
          logger.info(
            '[GpuPassthroughRemediationProvider] No NVIDIA runtime registered — skipping.'
          )
          return
        }

        const containers = await docker.listContainers({ all: false })
        const ollama = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`))

        if (!ollama) {
          logger.info(
            '[GpuPassthroughRemediationProvider] nomad_ollama not running — skipping.'
          )
          return
        }

        // Probe: read Ollama's own "inference compute" startup line from its logs.
        // This is the ground truth for whether Ollama loaded a GPU backend, and it
        // catches every failure mode:
        //   - nomad_ollama created CPU-only because the nvidia runtime was registered
        //     only AFTER first install (Ollama logs library=cpu), and
        //   - DeviceRequests present but the toolkit binding tore after a recreate,
        //     where Ollama silently falls back to CPU (also library=cpu).
        // The previous implementation probed by exec'ing `nvidia-smi` inside the
        // container, but a CPU-only container does not ship nvidia-smi, so the exec
        // returned an error string that the alphabetic-output check mistook for
        // "healthy" — a false negative that suppressed all auto-remediation.
        const container = docker.getContainer(ollama.Id)
        const { classifyOllamaComputeBackend } = await import('#services/ollama_compute')
        const backend = classifyOllamaComputeBackend(await readOllamaStartupLogs(container))

        if (backend === 'gpu') {
          logger.info(
            '[GpuPassthroughRemediationProvider] Ollama is using a GPU backend — no action needed.'
          )
          return
        }

        if (backend === 'unknown') {
          logger.info(
            '[GpuPassthroughRemediationProvider] No "inference compute" line found in nomad_ollama logs yet — skipping.'
          )
          return
        }

        // backend === 'cpu': an NVIDIA runtime is registered but Ollama still runs on
        // CPU. Cooldown: don't auto-reinstall more than once within the window. A
        // reinstall that fails to move Ollama onto the GPU (e.g. an architecture
        // Ollama has no kernels for) would otherwise trigger a reinstall every boot.
        const remediatedAtRaw = await KVStore.getValue('gpu.autoRemediatedAt')
        const remediatedAtMs = remediatedAtRaw ? new Date(String(remediatedAtRaw)).getTime() : NaN
        const withinCooldown =
          Number.isFinite(remediatedAtMs) && Date.now() - remediatedAtMs < AUTO_REMEDIATE_COOLDOWN_MS
        if (withinCooldown) {
          logger.warn(
            `[GpuPassthroughRemediationProvider] Ollama is on CPU but auto-remediation already ran within the last ${AUTO_REMEDIATE_COOLDOWN_MS / 60000}m (at ${remediatedAtRaw}). Skipping to avoid a reinstall loop; the manual "Fix: Reinstall AI Assistant" banner remains available.`
          )
          return
        }

        logger.warn(
          '[GpuPassthroughRemediationProvider] NVIDIA runtime registered but Ollama fell back to CPU. ' +
            'Auto-reinstalling nomad_ollama; volumes and installed models are preserved.'
        )

        const dockerService = new DockerService()
        const result = await dockerService.forceReinstall(SERVICE_NAMES.OLLAMA)

        if (result.success) {
          await KVStore.setValue('gpu.autoRemediatedAt', new Date().toISOString())
          logger.info(
            '[GpuPassthroughRemediationProvider] nomad_ollama force-reinstall completed successfully.'
          )
        } else {
          logger.error(
            `[GpuPassthroughRemediationProvider] Force-reinstall failed: ${result.message}. ` +
              'User can still click the "Fix: Reinstall AI Assistant" banner manually.'
          )
        }
      } catch (err: any) {
        logger.error(
          `[GpuPassthroughRemediationProvider] Auto-remediation check failed: ${err?.message ?? err}`
        )
      }
    })
  }
}

/**
 * Minimum gap between automatic nomad_ollama reinstalls triggered by this
 * provider. Bounds a reinstall loop when the GPU cannot be accelerated.
 */
const AUTO_REMEDIATE_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

/**
 * Read nomad_ollama's logs from its startup window (the five minutes after it
 * booted), where the "inference compute" line is emitted. Mirrors the windowing
 * in SystemService.getOllamaInferenceComputeFromLogs. Returns '' on any error so
 * the caller classifies the backend as 'unknown' rather than throwing.
 */
async function readOllamaStartupLogs(container: Docker.Container): Promise<string> {
  try {
    const inspect = await container.inspect()
    const startedAtRaw = inspect?.State?.StartedAt
    const startedAtMs = startedAtRaw ? new Date(startedAtRaw).getTime() : NaN

    const logsOpts: {
      stdout: true
      stderr: true
      follow: false
      since?: number
      until?: number
      tail?: number
    } = { stdout: true, stderr: true, follow: false }

    if (Number.isFinite(startedAtMs) && startedAtMs > 0) {
      const startedAtSec = Math.floor(startedAtMs / 1000)
      logsOpts.since = startedAtSec
      logsOpts.until = startedAtSec + 300
    } else {
      logsOpts.tail = 500
    }

    const buf = (await container.logs(logsOpts)) as unknown as Buffer
    return buf.toString('utf8')
  } catch {
    return ''
  }
}
