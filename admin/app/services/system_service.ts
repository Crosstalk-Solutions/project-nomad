import Service from '#models/service'
import { inject } from '@adonisjs/core'
import { DockerService } from '#services/docker_service'
import { ServiceSlim } from '../../types/services.js'
import logger from '@adonisjs/core/services/logger'
import si from 'systeminformation'
import { NomadDiskInfo, NomadDiskInfoRaw, SystemInformationResponse } from '../../types/system.js'
import { readFileSync } from 'fs'
import path, { join } from 'path'
import { getAllFilesystems, getFile } from '../utils/fs.js'
import axios from 'axios'
import env from '#start/env'

@inject()
export class SystemService {
  private static appVersion: string | null = null
  private static diskInfoFile = '/storage/nomad-disk-info.json'

  constructor(private dockerService: DockerService) {}

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
      const [cpu, mem, os, currentLoad, fsSize, uptime] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.currentLoad(),
        si.fsSize(),
        si.time(),
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

      return {
        cpu,
        mem,
        os,
        disk,
        currentLoad,
        fsSize,
        uptime,
      }
    } catch (error) {
      logger.error('Error getting system info:', error)
      return undefined
    }
  }

  async checkLatestVersion(): Promise<{
    success: boolean
    updateAvailable: boolean
    currentVersion: string
    latestVersion: string
    message?: string
  }> {
    try {
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

      const latestVersion = response.data.tag_name.replace(/^v/, '') // Remove leading 'v' if present
      const currentVersion = SystemService.getAppVersion()

      logger.info(`Current version: ${currentVersion}, Latest version: ${latestVersion}`)

      // NOTE: this will always return true in dev environment! See getAppVersion()
      const updateAvailable = latestVersion !== currentVersion

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
}
