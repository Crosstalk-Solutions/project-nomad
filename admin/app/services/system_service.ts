import Service from '#models/service'
import { inject } from '@adonisjs/core'
import { DockerService } from '#services/docker_service'
import { ServiceSlim } from '../../types/services.js'
import logger from '@adonisjs/core/services/logger'
import si from 'systeminformation'
import {
  GpuHealthStatus,
  NomadDiskInfo,
  NomadDiskInfoRaw,
  SystemInformationResponse,
} from '../../types/system.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { readFileSync } from 'node:fs'
import path, { join } from 'node:path'
import { getAllFilesystems, getFile } from '../utils/fs.js'
import axios from 'axios'
import env from '#start/env'
import KVStore from '#models/kv_store'
import { KV_STORE_SCHEMA, KVStoreKey } from '../../types/kv_store.js'
import { isNewerVersion } from '../utils/version.js'
import { invalidateAssistantNameCache } from '../../config/inertia.js'

@inject()
export class SystemService {
  private static appVersion: string | null = null
  private static diskInfoFile = '/storage/nomad-disk-info.json'

  constructor(private dockerService: DockerService) {}

  async checkServiceInstalled(serviceName: string): Promise<boolean> {
    const services = await this.getServices({ installedOnly: true })
    return services.some((service) => service.service_name === serviceName)
  }

  async getInternetStatus(): Promise<boolean> {
    const DEFAULT_TEST_URL = 'https://1.1.1.1/cdn-cgi/trace'
    const MAX_ATTEMPTS = 3

    let testUrl = DEFAULT_TEST_URL
    let customTestUrl = env.get('INTERNET_STATUS_TEST_URL')?.trim()

    // check that customTestUrl is a valid URL, if provided
    if (customTestUrl && customTestUrl !== '') {
      try {
        new URL(customTestUrl)
        testUrl = customTestUrl
      } catch (error) {
        logger.warn(
          `Invalid INTERNET_STATUS_TEST_URL: ${customTestUrl}. Falling back to default URL.`
        )
      }
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await axios.get(testUrl, { timeout: 5000 })
        return res.status === 200
      } catch (error) {
        logger.warn(
          `Internet status check attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error instanceof Error ? error.message : error}`
        )

        if (attempt < MAX_ATTEMPTS) {
          // delay before next attempt
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    logger.warn('All internet status check attempts failed.')
    return false
  }

  /**
   * Probe Ollama startup logs for the canonical "inference compute" line that records
   * which compute backend was selected. This catches silent CPU fallback (e.g. when
   * /dev/kfd is mounted but ROCm initialization fails, or NVML dies after an update)
   * which the older nvidia-smi exec probe could not detect.
   *
   * Returns the parsed library, GPU model name, and VRAM in MiB, or null when:
   *   - the Ollama container is not running
   *   - the line has not been emitted (Ollama still starting up)
   *   - logs show CPU-only operation (no GPU detected)
   */
  async getOllamaInferenceComputeFromLogs(): Promise<{
    library: 'CUDA' | 'ROCm'
    name: string
    vramMiB: number
  } | null> {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: false })
      const ollamaContainer = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`))
      if (!ollamaContainer) return null

      const container = this.dockerService.docker.getContainer(ollamaContainer.Id)
      const buf = (await container.logs({
        stdout: true,
        stderr: true,
        tail: 500,
        follow: false,
      })) as unknown as Buffer
      const logs = buf.toString('utf8')

      const lines = logs.split('\n').filter((l) => l.includes('msg="inference compute"'))
      if (lines.length === 0) return null

      const lastLine = lines[lines.length - 1]
      const libraryMatch = lastLine.match(/library=(CUDA|ROCm)/)
      if (!libraryMatch) return null

      const descMatch = lastLine.match(/description="([^"]+)"/)
      const totalMatch = lastLine.match(/total="([0-9.]+)\s*GiB"/)

      return {
        library: libraryMatch[1] as 'CUDA' | 'ROCm',
        name:
          descMatch?.[1] ||
          (libraryMatch[1] === 'CUDA' ? 'NVIDIA GPU' : 'AMD GPU'),
        vramMiB: totalMatch ? Math.round(Number.parseFloat(totalMatch[1]) * 1024) : 0,
      }
    } catch (error) {
      logger.warn(
        `[SystemService] Failed to probe Ollama logs for inference compute line: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  async getNvidiaSmiInfo(): Promise<
    | Array<{ vendor: string; model: string; vram: number }>
    | { error: string }
    | 'OLLAMA_NOT_FOUND'
    | 'BAD_RESPONSE'
    | 'UNKNOWN_ERROR'
  > {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: false })
      const ollamaContainer = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`))
      if (!ollamaContainer) {
        logger.info(
          'Ollama container not found for nvidia-smi info retrieval. This is expected if Ollama is not installed.'
        )
        return 'OLLAMA_NOT_FOUND'
      }

      // Execute nvidia-smi inside the Ollama container to get GPU info
      const container = this.dockerService.docker.getContainer(ollamaContainer.Id)
      const exec = await container.exec({
        Cmd: ['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      })

      // Read the output stream with a timeout to prevent hanging if nvidia-smi fails
      const stream = await exec.start({ Tty: true })
      const output = await new Promise<string>((resolve) => {
        let data = ''
        const timeout = setTimeout(() => resolve(data), 5000)
        stream.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        stream.on('end', () => {
          clearTimeout(timeout)
          resolve(data)
        })
      })

      // Remove any non-printable characters and trim the output
      const cleaned = Array.from(output)
        .filter((character) => character.charCodeAt(0) > 8)
        .join('')
        .trim()
      if (
        cleaned &&
        !cleaned.toLowerCase().includes('error') &&
        !cleaned.toLowerCase().includes('not found')
      ) {
        // Split by newlines to handle multiple GPUs installed
        const lines = cleaned.split('\n').filter((line) => line.trim())

        // Map each line out to a useful structure for us
        const gpus = lines.map((line) => {
          const parts = line.split(',').map((s) => s.trim())
          return {
            vendor: 'NVIDIA',
            model: parts[0] || 'NVIDIA GPU',
            vram: parts[1] ? Number.parseInt(parts[1], 10) : 0,
          }
        })

        return gpus.length > 0 ? gpus : 'BAD_RESPONSE'
      }

      // If we got output but looks like an error, consider it a bad response from nvidia-smi
      return 'BAD_RESPONSE'
    } catch (error) {
      logger.error('Error getting nvidia-smi info:', error)
      if (error instanceof Error && error.message) {
        return { error: error.message }
      }
      return 'UNKNOWN_ERROR'
    }
  }

  async getExternalOllamaGpuInfo(): Promise<Array<{
    vendor: string
    model: string
    vram: number
  }> | null> {
    try {
      // If a remote Ollama URL is configured, use it directly without requiring a local container
      const remoteOllamaUrl = await KVStore.getValue('ai.remoteOllamaUrl')
      if (!remoteOllamaUrl) {
        const containers = await this.dockerService.docker.listContainers({ all: false })
        const ollamaContainer = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`))
        if (!ollamaContainer) {
          return null
        }

        const actualImage = (ollamaContainer.Image || '').toLowerCase()
        if (actualImage.includes('ollama/ollama') || actualImage.startsWith('ollama:')) {
          return null
        }
      }

      const ollamaUrl = remoteOllamaUrl || (await this.dockerService.getServiceURL(SERVICE_NAMES.OLLAMA))
      if (!ollamaUrl) {
        return null
      }

      await axios.get(new URL('/api/tags', ollamaUrl).toString(), { timeout: 3000 })

      let vramMb = 0
      try {
        const psResponse = await axios.get(new URL('/api/ps', ollamaUrl).toString(), {
          timeout: 3000,
        })
        const loadedModels = Array.isArray(psResponse.data?.models) ? psResponse.data.models : []
        const largestAllocation = loadedModels.reduce(
          (max: number, model: { size_vram?: number | string }) =>
            Math.max(max, Number(model.size_vram) || 0),
          0
        )
        vramMb = largestAllocation > 0 ? Math.round(largestAllocation / (1024 * 1024)) : 0
      } catch {}

      return [
        {
          vendor: 'NVIDIA',
          model: 'NVIDIA GPU (external Ollama)',
          vram: vramMb,
        },
      ]
    } catch (error) {
      logger.info(
        `[SystemService] External Ollama GPU probe failed: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  async getServices({ installedOnly = true }: { installedOnly?: boolean }): Promise<ServiceSlim[]> {
    const statuses = await this._syncContainersWithDatabase() // Sync and reuse the fetched status list

    const query = Service.query()
      .orderBy('display_order', 'asc')
      .orderBy('friendly_name', 'asc')
      .select(
        'id',
        'service_name',
        'installed',
        'installation_status',
        'ui_location',
        'friendly_name',
        'description',
        'icon',
        'powered_by',
        'display_order',
        'container_image',
        'available_update_version'
      )
      .where('is_dependency_service', false)
    if (installedOnly) {
      query.where('installed', true)
    }

    const services = await query
    if (!services || services.length === 0) {
      return []
    }

    const toReturn: ServiceSlim[] = []

    for (const service of services) {
      const status = statuses.find((s) => s.service_name === service.service_name)
      toReturn.push({
        id: service.id,
        service_name: service.service_name,
        friendly_name: service.friendly_name,
        description: service.description,
        icon: service.icon,
        installed: service.installed,
        installation_status: service.installation_status,
        status: status ? status.status : 'unknown',
        ui_location: service.ui_location || '',
        powered_by: service.powered_by,
        display_order: service.display_order,
        container_image: service.container_image,
        available_update_version: service.available_update_version,
      })
    }

    return toReturn
  }

  static getAppVersion(): string {
    try {
      if (this.appVersion) {
        return this.appVersion
      }

      // Return 'dev' for development environment (version.json won't exist)
      if (process.env.NODE_ENV === 'development') {
        this.appVersion = 'dev'
        return 'dev'
      }

      const packageJson = readFileSync(join(process.cwd(), 'version.json'), 'utf-8')
      const packageData = JSON.parse(packageJson)

      const version = packageData.version || '0.0.0'

      this.appVersion = version
      return version
    } catch (error) {
      logger.error('Error getting app version:', error)
      return '0.0.0'
    }
  }

  async getSystemInfo(): Promise<SystemInformationResponse | undefined> {
    try {
      const [cpu, mem, os, currentLoad, fsSize, uptime, graphics] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.currentLoad(),
        si.fsSize(),
        si.time(),
        si.graphics(),
      ])

      let diskInfo: NomadDiskInfoRaw | undefined
      let disk: NomadDiskInfo[] = []

      try {
        const diskInfoRawString = await getFile(
          path.join(process.cwd(), SystemService.diskInfoFile),
          'string'
        )

        diskInfo = (
          diskInfoRawString
            ? JSON.parse(diskInfoRawString.toString())
            : { diskLayout: { blockdevices: [] }, fsSize: [] }
        ) as NomadDiskInfoRaw

        disk = this.calculateDiskUsage(diskInfo)
      } catch (error) {
        logger.error('Error reading disk info file:', error)
      }

      // GPU health tracking — detect when host has a GPU runtime but Ollama can't access it.
      // Primary probe: parse Ollama's "inference compute" startup log line for both NVIDIA
      // and AMD. Secondary probe (NVIDIA only): nvidia-smi exec, retained as a fallback for
      // hardware enrichment when log parsing has not yet captured a startup line.
      let gpuHealth: GpuHealthStatus = {
        status: 'no_gpu',
        hasNvidiaRuntime: false,
        hasRocmRuntime: false,
        ollamaGpuAccessible: false,
      }

      // Query Docker API for host-level info (hostname, OS, GPU runtime)
      // si.osInfo() returns the container's info inside Docker, not the host's
      try {
        const dockerInfo = await this.dockerService.docker.info()

        if (dockerInfo.Name) {
          os.hostname = dockerInfo.Name
        }
        if (dockerInfo.OperatingSystem) {
          os.distro = dockerInfo.OperatingSystem
        }
        if (dockerInfo.KernelVersion) {
          os.kernel = dockerInfo.KernelVersion
        }

        // If si.graphics() returned no controllers (common inside Docker),
        // fall back to runtime + Ollama log probe to figure out what's accessible.
        if (!graphics.controllers || graphics.controllers.length === 0) {
          const runtimes = dockerInfo.Runtimes || {}
          gpuHealth.hasNvidiaRuntime = 'nvidia' in runtimes

          // AMD doesn't register a Docker runtime — detection persists in KV (gpu.type)
          // after first install-time discovery in DockerService._detectGPUType().
          // Honor the user opt-out (default-on); a 'false' string OR boolean both count.
          const savedGpuType = await KVStore.getValue('gpu.type')
          const amdEnabledRaw = await KVStore.getValue('ai.amdGpuAcceleration')
          const amdAccelerationEnabled = String(amdEnabledRaw) !== 'false'
          gpuHealth.hasRocmRuntime = savedGpuType === 'amd' && amdAccelerationEnabled

          if (gpuHealth.hasNvidiaRuntime || gpuHealth.hasRocmRuntime) {
            gpuHealth.gpuVendor = gpuHealth.hasNvidiaRuntime ? 'nvidia' : 'amd'

            // Primary probe: Ollama log parsing — works for both vendors and catches silent fallback
            const logInfo = await this.getOllamaInferenceComputeFromLogs()
            if (logInfo) {
              graphics.controllers = [
                {
                  model: logInfo.name,
                  vendor: logInfo.library === 'CUDA' ? 'NVIDIA' : 'AMD',
                  bus: '',
                  vram: logInfo.vramMiB,
                  vramDynamic: false,
                },
              ]
              gpuHealth.status = 'ok'
              gpuHealth.ollamaGpuAccessible = true
            } else if (gpuHealth.hasNvidiaRuntime) {
              // NVIDIA secondary path: nvidia-smi exec preserves prior behavior when
              // the log parser hasn't seen a startup line yet (e.g. log rotation,
              // very fresh container). Distinguishes "no Ollama container" from
              // "container exists but GPU broken".
              const nvidiaInfo = await this.getNvidiaSmiInfo()
              if (Array.isArray(nvidiaInfo)) {
                graphics.controllers = nvidiaInfo.map((gpu) => ({
                  model: gpu.model,
                  vendor: gpu.vendor,
                  bus: '',
                  vram: gpu.vram,
                  vramDynamic: false,
                }))
                gpuHealth.status = 'ok'
                gpuHealth.ollamaGpuAccessible = true
              } else if (nvidiaInfo === 'OLLAMA_NOT_FOUND') {
                const externalOllamaGpu = await this.getExternalOllamaGpuInfo()
                if (externalOllamaGpu) {
                  graphics.controllers = externalOllamaGpu.map((gpu) => ({
                    model: gpu.model,
                    vendor: gpu.vendor,
                    bus: '',
                    vram: gpu.vram,
                    vramDynamic: false,
                  }))
                  gpuHealth.status = 'ok'
                  gpuHealth.ollamaGpuAccessible = true
                } else {
                  gpuHealth.status = 'ollama_not_installed'
                }
              } else {
                const externalOllamaGpu = await this.getExternalOllamaGpuInfo()
                if (externalOllamaGpu) {
                  graphics.controllers = externalOllamaGpu.map((gpu) => ({
                    model: gpu.model,
                    vendor: gpu.vendor,
                    bus: '',
                    vram: gpu.vram,
                    vramDynamic: false,
                  }))
                  gpuHealth.status = 'ok'
                  gpuHealth.ollamaGpuAccessible = true
                } else {
                  gpuHealth.status = 'passthrough_failed'
                  logger.warn(
                    `NVIDIA runtime detected but GPU passthrough failed: ${typeof nvidiaInfo === 'string' ? nvidiaInfo : JSON.stringify(nvidiaInfo)}`
                  )
                }
              }
            } else {
              // AMD path: no nvidia-smi equivalent worth running — log parser is authoritative.
              // Distinguish "Ollama not running" from "Ollama running but no GPU log line".
              const containers = await this.dockerService.docker.listContainers({ all: false })
              const ollamaRunning = containers.some((c) =>
                c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`)
              )
              if (!ollamaRunning) {
                const externalOllamaGpu = await this.getExternalOllamaGpuInfo()
                if (externalOllamaGpu) {
                  graphics.controllers = externalOllamaGpu.map((gpu) => ({
                    model: gpu.model,
                    vendor: gpu.vendor,
                    bus: '',
                    vram: gpu.vram,
                    vramDynamic: false,
                  }))
                  gpuHealth.status = 'ok'
                  gpuHealth.ollamaGpuAccessible = true
                } else {
                  gpuHealth.status = 'ollama_not_installed'
                }
              } else {
                gpuHealth.status = 'passthrough_failed'
                logger.warn(
                  'AMD GPU detected but Ollama logs show no ROCm initialization — passthrough or HSA override may have failed'
                )
              }
            }
          }
        } else {
          // si.graphics() returned controllers (host install, not Docker) — GPU is working
          gpuHealth.status = 'ok'
          gpuHealth.ollamaGpuAccessible = true
        }
      } catch {
        // Docker info query failed, skip host-level enrichment
      }

      return {
        cpu,
        mem,
        os,
        disk,
        currentLoad,
        fsSize,
        uptime,
        graphics,
        gpuHealth,
      }
    } catch (error) {
      logger.error('Error getting system info:', error)
      return undefined
    }
  }

  async checkLatestVersion(force?: boolean): Promise<{
    success: boolean
    updateAvailable: boolean
    currentVersion: string
    latestVersion: string
    message?: string
  }> {
    try {
      const currentVersion = SystemService.getAppVersion()
      const cachedUpdateAvailable = await KVStore.getValue('system.updateAvailable')
      const cachedLatestVersion = await KVStore.getValue('system.latestVersion')

      // Use cached values if not forcing a fresh check.
      // the CheckUpdateJob will update these values every 12 hours
      if (!force) {
        return {
          success: true,
          updateAvailable: cachedUpdateAvailable ?? false,
          currentVersion,
          latestVersion: cachedLatestVersion || '',
        }
      }

      const earlyAccess = (await KVStore.getValue('system.earlyAccess')) ?? false

      let latestVersion: string
      if (earlyAccess) {
        const response = await axios.get(
          'https://api.github.com/repos/Crosstalk-Solutions/project-nomad/releases',
          { headers: { Accept: 'application/vnd.github+json' }, timeout: 5000 }
        )
        if (!response?.data?.length) throw new Error('No releases found')
        latestVersion = response.data[0].tag_name.replace(/^v/, '').trim()
      } else {
        const response = await axios.get(
          'https://api.github.com/repos/Crosstalk-Solutions/project-nomad/releases/latest',
          { headers: { Accept: 'application/vnd.github+json' }, timeout: 5000 }
        )
        if (!response?.data?.tag_name) throw new Error('Invalid response from GitHub API')
        latestVersion = response.data.tag_name.replace(/^v/, '').trim()
      }

      logger.info(`Current version: ${currentVersion}, Latest version: ${latestVersion}`)

      const updateAvailable =
        process.env.NODE_ENV === 'development'
          ? false
          : isNewerVersion(latestVersion, currentVersion.trim(), earlyAccess)

      // Cache the results in KVStore for frontend checks
      await KVStore.setValue('system.updateAvailable', updateAvailable)
      await KVStore.setValue('system.latestVersion', latestVersion)

      return {
        success: true,
        updateAvailable,
        currentVersion,
        latestVersion,
      }
    } catch (error) {
      logger.error('Error checking latest version:', error)
      return {
        success: false,
        updateAvailable: false,
        currentVersion: '',
        latestVersion: '',
        message: `Failed to check latest version: ${error instanceof Error ? error.message : error}`,
      }
    }
  }

  async subscribeToReleaseNotes(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.post(
        'https://api.projectnomad.us/api/v1/lists/release-notes/subscribe',
        { email },
        { timeout: 5000 }
      )

      if (response.status === 200) {
        return {
          success: true,
          message: 'Successfully subscribed to release notes',
        }
      }

      return {
        success: false,
        message: `Failed to subscribe: ${response.statusText}`,
      }
    } catch (error) {
      logger.error('Error subscribing to release notes:', error)
      return {
        success: false,
        message: `Failed to subscribe: ${error instanceof Error ? error.message : error}`,
      }
    }
  }

  async getDebugInfo(): Promise<string> {
    const appVersion = SystemService.getAppVersion()
    const environment = process.env.NODE_ENV || 'unknown'

    const [systemInfo, services, internetStatus, versionCheck] = await Promise.all([
      this.getSystemInfo(),
      this.getServices({ installedOnly: false }),
      this.getInternetStatus().catch(() => null),
      this.checkLatestVersion().catch(() => null),
    ])

    const lines: string[] = [
      'Project NOMAD Debug Info',
      '========================',
      `App Version: ${appVersion}`,
      `Environment: ${environment}`,
    ]

    if (systemInfo) {
      const { cpu, mem, os, disk, fsSize, uptime, graphics } = systemInfo

      lines.push('')
      lines.push('System:')
      if (os.distro) lines.push(`  OS: ${os.distro}`)
      if (os.hostname) lines.push(`  Hostname: ${os.hostname}`)
      if (os.kernel) lines.push(`  Kernel: ${os.kernel}`)
      if (os.arch) lines.push(`  Architecture: ${os.arch}`)
      if (uptime?.uptime) lines.push(`  Uptime: ${this._formatUptime(uptime.uptime)}`)

      lines.push('')
      lines.push('Hardware:')
      if (cpu.brand) {
        lines.push(`  CPU: ${cpu.brand} (${cpu.cores} cores)`)
      }
      if (mem.total) {
        const total = this._formatBytes(mem.total)
        const used = this._formatBytes(mem.total - (mem.available || 0))
        const available = this._formatBytes(mem.available || 0)
        lines.push(`  RAM: ${total} total, ${used} used, ${available} available`)
      }
      if (graphics.controllers && graphics.controllers.length > 0) {
        for (const gpu of graphics.controllers) {
          const vram = gpu.vram ? ` (${gpu.vram} MB VRAM)` : ''
          lines.push(`  GPU: ${gpu.model}${vram}`)
        }
      } else {
        lines.push('  GPU: None detected')
      }

      // Disk info — try disk array first, fall back to fsSize
      const diskEntries = disk.filter((d) => d.totalSize > 0)
      if (diskEntries.length > 0) {
        for (const d of diskEntries) {
          const size = this._formatBytes(d.totalSize)
          const type = d.tran?.toUpperCase() || (d.rota ? 'HDD' : 'SSD')
          lines.push(`  Disk: ${size}, ${Math.round(d.percentUsed)}% used, ${type}`)
        }
      } else if (fsSize.length > 0) {
        const realFs = fsSize.filter((f) => f.fs.startsWith('/dev/'))
        const seen = new Set<number>()
        for (const f of realFs) {
          if (seen.has(f.size)) continue
          seen.add(f.size)
          lines.push(`  Disk: ${this._formatBytes(f.size)}, ${Math.round(f.use)}% used`)
        }
      }
    }

    const installed = services.filter((s) => s.installed)
    lines.push('')
    if (installed.length > 0) {
      lines.push('Installed Services:')
      for (const svc of installed) {
        lines.push(`  ${svc.friendly_name} (${svc.service_name}): ${svc.status}`)
      }
    } else {
      lines.push('Installed Services: None')
    }

    if (internetStatus !== null) {
      lines.push('')
      lines.push(`Internet Status: ${internetStatus ? 'Online' : 'Offline'}`)
    }

    if (versionCheck?.success) {
      const updateMsg = versionCheck.updateAvailable
        ? `Yes (${versionCheck.latestVersion} available)`
        : `No (${versionCheck.currentVersion} is latest)`
      lines.push(`Update Available: ${updateMsg}`)
    }

    return lines.join('\n')
  }

  private _formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  private _formatBytes(bytes: number, decimals = 1): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
  }

  async updateSetting(key: KVStoreKey, value: any): Promise<void> {
    if (
      (value === '' || value === undefined || value === null) &&
      KV_STORE_SCHEMA[key] === 'string'
    ) {
      await KVStore.clearValue(key)
    } else {
      await KVStore.setValue(key, value)
    }
    if (key === 'ai.assistantCustomName') {
      invalidateAssistantNameCache()
    }
  }

  /**
   * Checks the current state of Docker containers against the database records and updates the database accordingly.
   * It will mark services as not installed if their corresponding containers do not exist, regardless of their running state.
   * Handles cases where a container might have been manually removed, ensuring the database reflects the actual existence of containers.
   * Containers that exist but are stopped, paused, or restarting will still be considered installed.
   * Returns the fetched service status list so callers can reuse it without a second Docker API call.
   */
  private async _syncContainersWithDatabase(): Promise<{ service_name: string; status: string }[]> {
    try {
      const allServices = await Service.all()
      const serviceStatusList = await this.dockerService.getServicesStatus()

      for (const service of allServices) {
        const containerExists = serviceStatusList.find(
          (s) => s.service_name === service.service_name
        )

        if (service.installed) {
          // If marked as installed but container doesn't exist, mark as not installed
          if (!containerExists) {
            // Exception: remote Ollama is configured without a local container — don't reset it
            if (service.service_name === SERVICE_NAMES.OLLAMA) {
              const remoteUrl = await KVStore.getValue('ai.remoteOllamaUrl')
              if (remoteUrl) continue
            }
            logger.warn(
              `Service ${service.service_name} is marked as installed but container does not exist. Marking as not installed.`
            )
            service.installed = false
            service.installation_status = 'idle'
            await service.save()
          }
        } else {
          // If marked as not installed but container exists (any state), mark as installed
          if (containerExists) {
            logger.warn(
              `Service ${service.service_name} is marked as not installed but container exists. Marking as installed.`
            )
            service.installed = true
            service.installation_status = 'idle'
            await service.save()
          }
        }
      }

      return serviceStatusList
    } catch (error) {
      logger.error('Error syncing containers with database:', error)
      return []
    }
  }

  private calculateDiskUsage(diskInfo: NomadDiskInfoRaw): NomadDiskInfo[] {
    const { diskLayout, fsSize } = diskInfo

    if (!diskLayout?.blockdevices || !fsSize) {
      return []
    }

    // Deduplicate: same device path mounted in multiple places (Docker bind-mounts)
    // Keep the entry with the largest size — that's the real partition
    const deduped = new Map<string, NomadDiskInfoRaw['fsSize'][0]>()
    for (const entry of fsSize) {
      const existing = deduped.get(entry.fs)
      if (!existing || entry.size > existing.size) {
        deduped.set(entry.fs, entry)
      }
    }
    const dedupedFsSize = Array.from(deduped.values())

    return diskLayout.blockdevices
      .filter((disk) => disk.type === 'disk') // Only physical disks
      .map((disk) => {
        const filesystems = getAllFilesystems(disk, dedupedFsSize)

        // Across all partitions
        const totalUsed = filesystems.reduce((sum, p) => sum + (p.used || 0), 0)
        const totalSize = filesystems.reduce((sum, p) => sum + (p.size || 0), 0)
        const percentUsed = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0

        return {
          name: disk.name,
          model: disk.model || 'Unknown',
          vendor: disk.vendor || '',
          rota: disk.rota || false,
          tran: disk.tran || '',
          size: disk.size,
          totalUsed,
          totalSize,
          percentUsed: Math.round(percentUsed * 100) / 100,
          filesystems: filesystems.map((p) => ({
            fs: p.fs,
            mount: p.mount,
            used: p.used,
            size: p.size,
            percentUsed: p.use,
          })),
        }
      })
  }
}
