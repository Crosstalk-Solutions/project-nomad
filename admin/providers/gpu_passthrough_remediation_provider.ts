import logger from '@adonisjs/core/services/logger'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Auto-remediates NVIDIA GPU passthrough loss after admin / host restart.
 *
 * After an update or container recreate, nomad_ollama's HostConfig.DeviceRequests
 * still lists the nvidia driver, but the NVIDIA Container Toolkit binding inside
 * the container is torn. `nvidia-smi` inside the container returns
 * "Failed to initialize NVML: Unknown Error" and Ollama silently falls back to
 * CPU inference. PR #208 added detection + a one-click "Fix: Reinstall AI Assistant"
 * banner. This provider does that click automatically on admin boot when the
 * condition is detected.
 *
 * Guards:
 *   - NVIDIA-only. AMD passthrough_failed has a different fix path (HSA override
 *     handling in PR #804) and is left to the user.
 *   - One-shot per admin boot. The provider runs once on startup; if the recreate
 *     itself fails the banner remains as a fallback.
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

        // Probe: exec nvidia-smi inside the Ollama container. NVML init failure
        // is the signature of a broken passthrough that DeviceRequests can't see.
        const container = docker.getContainer(ollama.Id)
        const exec = await container.exec({
          Cmd: ['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'],
          AttachStdout: true,
          AttachStderr: true,
        })
        const stream = await exec.start({ Tty: true })
        const output = await new Promise<string>((resolve) => {
          let buf = ''
          const timer = setTimeout(() => resolve(buf || 'TIMEOUT'), 8000)
          stream.on('data', (chunk: Buffer) => (buf += chunk.toString('utf8')))
          stream.on('end', () => {
            clearTimeout(timer)
            resolve(buf)
          })
        })

        const passthroughBroken =
          /Failed to initialize NVML|Unknown Error|TIMEOUT/i.test(output) ||
          !/[A-Za-z]/.test(output)

        if (!passthroughBroken) {
          logger.info(
            '[GpuPassthroughRemediationProvider] NVIDIA passthrough healthy — no action needed.'
          )
          return
        }

        logger.warn(
          '[GpuPassthroughRemediationProvider] NVIDIA passthrough broken (nvidia-smi inside nomad_ollama failed). ' +
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
