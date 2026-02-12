import Service from '#models/service'
import { inject } from '@adonisjs/core'
import { DockerService } from '#services/docker_service'
import { ServiceSlim } from '../../types/services.js'
import logger from '@adonisjs/core/services/logger'
import si from 'systeminformation'
import { NomadDiskInfo, NomadDiskInfoRaw, SystemInformationResponse } from '../../types/system.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { readFileSync } from 'fs'
import path, { join } from 'path'
import { getAllFilesystems, getFile } from '../utils/fs.js'
import axios from 'axios'
import env from '#start/env'
import KVStore from '#models/kv_store'
import { KVStoreKey } from '../../types/kv_store.js'
import { parseBoolean } from '../utils/misc.js'

@inject()
export class SystemService {
  private static appVersion: string | null = null
  private static diskInfoFile = '/storage/nomad-disk-info.json'

  constructor(private dockerService: DockerService) { }

  async checkServiceInstalled(serviceName: string): Promise<boolean> {
    const services = await this.getServices({ installedOnly: true });
    return services.some(service => service.service_name === serviceName);
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

  async getNvidiaSmiInfo(): Promise<Array<{ vendor: string; model: string; vram: number; }> | { error: string } | 'OLLAMA_NOT_FOUND' | 'BAD_RESPONSE' | 'UNKNOWN_ERROR'> {
    try {
      const containers = await this.dockerService.docker.listContainers({ all: false })
      const ollamaContainer = containers.find((c) =>
        c.Names.includes(`/${SERVICE_NAMES.OLLAMA}`)
      )
      if (!ollamaContainer) {
        logger.info('Ollama container not found for nvidia-smi info retrieval. This is expected if Ollama is not installed.')
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
        stream.on('data', (chunk: Buffer) => { data += chunk.toString() })
        stream.on('end', () => { clearTimeout(timeout); resolve(data) })
      })

      // Remove any non-printable characters and trim the output
      const cleaned = output.replace(/[\x00-\x08]/g, '').trim()
      if (cleaned && !cleaned.toLowerCase().includes('error') && !cleaned.toLowerCase().includes('not found')) {
        // Split by newlines to handle multiple GPUs installed
        const lines = cleaned.split('\n').filter(line => line.trim())

        // Map each line out to a useful structure for us
        const gpus = lines.map(line => {
          const parts = line.split(',').map((s) => s.trim())
          return {
            vendor: 'NVIDIA',
            model: parts[0] || 'NVIDIA GPU',
            vram: parts[1] ? parseInt(parts[1], 10) : 0,
          }
        })

        return gpus.length > 0 ? gpus : 'BAD_RESPONSE'
      }

      // If we got output but looks like an error, consider it a bad response from nvidia-smi
      return 'BAD_RESPONSE'
    }
    catch (error) {
      logger.error('Error getting nvidia-smi info:', error)
      if (error instanceof Error && error.message) {
        return { error: error.message }
      }
      return 'UNKNOWN_ERROR'
    }
  }

  async getServices({ installedOnly = true }: { installedOnly?: boolean }): Promise<ServiceSlim[]> {
    await this._syncContainersWithDatabase() // Sync up before fetching to ensure we have the latest status

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
        'display_order'
      )
      .where('is_dependency_service', false)
    if (installedOnly) {
      query.where('installed', true)
    }

    const services = await query
    if (!services || services.length === 0) {
      return []
    }

    const statuses = await this.dockerService.getServicesStatus()

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
        // fall back to nvidia runtime + nvidia-smi detection
        if (!graphics.controllers || graphics.controllers.length === 0) {
          const runtimes = dockerInfo.Runtimes || {}
          if ('nvidia' in runtimes) {
            const nvidiaInfo = await this.getNvidiaSmiInfo()
            if (Array.isArray(nvidiaInfo)) {
              graphics.controllers = nvidiaInfo.map((gpu) => ({
                model: gpu.model,
                vendor: gpu.vendor,
                bus: "",
                vram: gpu.vram,
                vramDynamic: false, // assume false here, we don't actually use this field for our purposes.
              }))
            } else {
              logger.warn(`NVIDIA runtime detected but failed to get GPU info: ${typeof nvidiaInfo === 'string' ? nvidiaInfo : JSON.stringify(nvidiaInfo)}`)
            }
          }
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
          updateAvailable: parseBoolean(cachedUpdateAvailable || "false"),
          currentVersion,
          latestVersion: cachedLatestVersion || '',
        }
      }

      const response = await axios.get(
        'https://api.github.com/repos/Crosstalk-Solutions/project-nomad/releases/latest',
        {
          headers: { Accept: 'application/vnd.github+json' },
          timeout: 5000,
        }
      )

      if (!response || !response.data?.tag_name) {
        throw new Error('Invalid response from GitHub API')
      }

    const latestVersion = response.data.tag_name.replace(/^v/, '').trim() // Remove leading 'v' and whitespace
    logger.info(`Current version: ${currentVersion}, Latest version: ${latestVersion}`)

    const updateAvailable = process.env.NODE_ENV === 'development' 
      ? false 
      : this.isNewerVersion(latestVersion, currentVersion.trim())

      // Cache the results in KVStore for frontend checks
      await KVStore.setValue('system.updateAvailable', updateAvailable.toString())
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

  async updateSetting(key: KVStoreKey, value: any): Promise<void> {
    await KVStore.setValue(key, value);
  }

  /**
   * Checks the current state of Docker containers against the database records and updates the database accordingly.
   * It will mark services as not installed if their corresponding containers do not exist, regardless of their running state.
   * Handles cases where a container might have been manually removed, ensuring the database reflects the actual existence of containers.
   * Containers that exist but are stopped, paused, or restarting will still be considered installed.
   */
  private async _syncContainersWithDatabase() {
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
    } catch (error) {
      logger.error('Error syncing containers with database:', error)
    }
  }

  private calculateDiskUsage(diskInfo: NomadDiskInfoRaw): NomadDiskInfo[] {
    const { diskLayout, fsSize } = diskInfo

    if (!diskLayout?.blockdevices || !fsSize) {
      return []
    }

    return diskLayout.blockdevices
      .filter((disk) => disk.type === 'disk') // Only physical disks
      .map((disk) => {
        const filesystems = getAllFilesystems(disk, fsSize)

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

  /**
   * Compare two semantic version strings to determine if the first is newer than the second.
   * @param version1 - The version to check (e.g., "1.25.0")
   * @param version2 - The current version (e.g., "1.24.0")
   * @returns true if version1 is newer than version2
   */
  private isNewerVersion(version1: string, version2: string): boolean {
    const v1Parts = version1.split('.').map((part) => parseInt(part, 10))
    const v2Parts = version2.split('.').map((part) => parseInt(part, 10))

    const maxLength = Math.max(v1Parts.length, v2Parts.length)

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0
      const v2Part = v2Parts[i] || 0

      if (v1Part > v2Part) return true
      if (v1Part < v2Part) return false
    }

    return false // Versions are equal
  }
}
