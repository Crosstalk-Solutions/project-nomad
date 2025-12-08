import Service from '#models/service'
import Docker from 'dockerode'
import logger from '@adonisjs/core/services/logger'
import { inject } from '@adonisjs/core'
import { ServiceStatus } from '../../types/services.js'
import transmit from '@adonisjs/transmit/services/main'
import { doResumableDownloadWithRetry } from '../utils/downloads.js'
import path from 'path'

@inject()
export class DockerService {
  private docker: Docker
  public static KIWIX_SERVICE_NAME = 'nomad_kiwix_serve'
  public static OLLAMA_SERVICE_NAME = 'nomad_ollama'
  public static OPEN_WEBUI_SERVICE_NAME = 'nomad_open_webui'
  public static CYBERCHEF_SERVICE_NAME = 'nomad_cyberchef'
  public static FLATNOTES_SERVICE_NAME = 'nomad_flatnotes'
  public static KOLIBRI_SERVICE_NAME = 'nomad_kolibri'
  public static NOMAD_STORAGE_PATH = '/storage'

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' })
  }

  async affectContainer(
    serviceName: string,
    action: 'start' | 'stop' | 'restart'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const service = await Service.query().where('service_name', serviceName).first()
      if (!service || !service.installed) {
        return {
          success: false,
          message: `Service ${serviceName} not found or not installed`,
        }
      }

      const containers = await this.docker.listContainers({ all: true })
      const container = containers.find((c) => c.Names.includes(`/${serviceName}`))
      if (!container) {
        return {
          success: false,
          message: `Container for service ${serviceName} not found`,
        }
      }

      const dockerContainer = this.docker.getContainer(container.Id)
      if (action === 'stop') {
        await dockerContainer.stop()
        return {
          success: true,
          message: `Service ${serviceName} stopped successfully`,
        }
      }

      if (action === 'restart') {
        await dockerContainer.restart()

        return {
          success: true,
          message: `Service ${serviceName} restarted successfully`,
        }
      }

      if (action === 'start') {
        if (container.State === 'running') {
          return {
            success: true,
            message: `Service ${serviceName} is already running`,
          }
        }

        await dockerContainer.start()

        return {
          success: true,
          message: `Service ${serviceName} started successfully`,
        }
      }

      return {
        success: false,
        message: `Invalid action: ${action}. Use 'start', 'stop', or 'restart'.`,
      }
    } catch (error) {
      logger.error(`Error starting service ${serviceName}: ${error.message}`)
      return {
        success: false,
        message: `Failed to start service ${serviceName}: ${error.message}`,
      }
    }
  }

  async getServicesStatus(): Promise<
    {
      service_name: string
      status: ServiceStatus
    }[]
  > {
    try {
      const services = await Service.query().where('installed', true)
      if (!services || services.length === 0) {
        return []
      }

      const containers = await this.docker.listContainers({ all: true })
      const containerMap = new Map<string, Docker.ContainerInfo>()
      containers.forEach((container) => {
        const name = container.Names[0].replace('/', '')
        if (name.startsWith('nomad_')) {
          containerMap.set(name, container)
        }
      })

      const getStatus = (state: string): ServiceStatus => {
        switch (state) {
          case 'running':
            return 'running'
          case 'exited':
          case 'created':
          case 'paused':
            return 'stopped'
          default:
            return 'unknown'
        }
      }

      return Array.from(containerMap.entries()).map(([name, container]) => ({
        service_name: name,
        status: getStatus(container.State),
      }))
    } catch (error) {
      console.error(`Error fetching services status: ${error.message}`)
      return []
    }
  }

  async createContainerPreflight(
    serviceName: string
  ): Promise<{ success: boolean; message: string }> {
    const service = await Service.query().where('service_name', serviceName).first()
    if (!service) {
      return {
        success: false,
        message: `Service ${serviceName} not found`,
      }
    }

    if (service.installed) {
      return {
        success: false,
        message: `Service ${serviceName} is already installed`,
      }
    }

    // Check if a service wasn't marked as installed but has an existing container
    // This can happen if the service was created but not properly installed
    // or if the container was removed manually without updating the service status.
    // if (await this._checkIfServiceContainerExists(serviceName)) {
    //   const removeResult = await this._removeServiceContainer(serviceName);
    //   if (!removeResult.success) {
    //     return {
    //       success: false,
    //       message: `Failed to remove existing container for service ${serviceName}: ${removeResult.message}`,
    //     };
    //   }
    // }

    const containerConfig = this._parseContainerConfig(service.container_config)
    await this._createContainer(service, containerConfig)

    return {
      success: true,
      message: `Service ${serviceName} installation initiated successfully. You can receive updates via server-sent events.`,
    }
  }

  /**
   * Handles the long-running process of creating a Docker container for a service.
   * NOTE: This method should not be called directly. Instead, use `createContainerPreflight` to check prerequisites first
   * This method will also transmit server-sent events to the client to notify of progress.
   * @param serviceName
   * @returns
   */
  async _createContainer(
    service: Service & { dependencies?: Service[] },
    containerConfig: any
  ): Promise<void> {
    try {
      this._broadcast(service.service_name, 'initializing', '')

      let dependencies = []
      if (service.depends_on) {
        const dependency = await Service.query().where('service_name', service.depends_on).first()
        if (dependency) {
          dependencies.push(dependency)
        }
      }

      // First, check if the service has any dependencies that need to be installed first
      if (dependencies && dependencies.length > 0) {
        this._broadcast(
          service.service_name,
          'checking-dependencies',
          `Checking dependencies for service ${service.service_name}...`
        )
        for (const dependency of dependencies) {
          if (!dependency.installed) {
            this._broadcast(
              service.service_name,
              'dependency-not-installed',
              `Dependency service ${dependency.service_name} is not installed. Installing it first...`
            )
            await this._createContainer(
              dependency,
              this._parseContainerConfig(dependency.container_config)
            )
          } else {
            this._broadcast(
              service.service_name,
              'dependency-installed',
              `Dependency service ${dependency.service_name} is already installed.`
            )
          }
        }
      }

      // Start pulling the Docker image and wait for it to complete
      const pullStream = await this.docker.pull(service.container_image)
      this._broadcast(
        service.service_name,
        'pulling',
        `Pulling Docker image ${service.container_image}...`
      )
      await new Promise((res) => this.docker.modem.followProgress(pullStream, res))

      if (service.service_name === DockerService.KIWIX_SERVICE_NAME) {
        await this._runPreinstallActions__KiwixServe()
        this._broadcast(
          service.service_name,
          'preinstall-complete',
          `Pre-install actions for Kiwix Serve completed successfully.`
        )
      }

      this._broadcast(
        service.service_name,
        'creating',
        `Creating Docker container for service ${service.service_name}...`
      )
      const container = await this.docker.createContainer({
        Image: service.container_image,
        name: service.service_name,
        ...(containerConfig?.User && { User: containerConfig.User }),
        ...(containerConfig?.HostConfig && { HostConfig: containerConfig.HostConfig }),
        ...(containerConfig?.WorkingDir && { WorkingDir: containerConfig.WorkingDir }),
        ...(containerConfig?.ExposedPorts && { ExposedPorts: containerConfig.ExposedPorts }),
        ...(containerConfig?.Env && { Env: containerConfig.Env }),
        ...(service.container_command ? { Cmd: service.container_command.split(' ') } : {}),
      })

      this._broadcast(
        service.service_name,
        'starting',
        `Starting Docker container for service ${service.service_name}...`
      )
      await container.start()

      this._broadcast(
        service.service_name,
        'finalizing',
        `Finalizing installation of service ${service.service_name}...`
      )
      service.installed = true
      await service.save()

      this._broadcast(
        service.service_name,
        'completed',
        `Service ${service.service_name} installation completed successfully.`
      )
    } catch (error) {
      this._broadcast(
        service.service_name,
        'error',
        `Error installing service ${service.service_name}: ${error.message}`
      )
      throw new Error(`Failed to install service ${service.service_name}: ${error.message}`)
    }
  }

  async _checkIfServiceContainerExists(serviceName: string): Promise<boolean> {
    try {
      const containers = await this.docker.listContainers({ all: true })
      return containers.some((container) => container.Names.includes(`/${serviceName}`))
    } catch (error) {
      logger.error(`Error checking if service container exists: ${error.message}`)
      return false
    }
  }

  async _removeServiceContainer(
    serviceName: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const containers = await this.docker.listContainers({ all: true })
      const container = containers.find((c) => c.Names.includes(`/${serviceName}`))
      if (!container) {
        return { success: false, message: `Container for service ${serviceName} not found` }
      }

      const dockerContainer = this.docker.getContainer(container.Id)
      await dockerContainer.stop()
      await dockerContainer.remove()

      return { success: true, message: `Service ${serviceName} container removed successfully` }
    } catch (error) {
      logger.error(`Error removing service container: ${error.message}`)
      return {
        success: false,
        message: `Failed to remove service ${serviceName} container: ${error.message}`,
      }
    }
  }

  private async _runPreinstallActions__KiwixServe(): Promise<void> {
    /**
     * At least one .zim file must be available before we can start the kiwix container.
     * We'll download the lightweight mini Wikipedia Top 100 zim file for this purpose.
     **/
    const WIKIPEDIA_ZIM_URL =
      'https://github.com/Crosstalk-Solutions/project-nomad/raw/refs/heads/master/install/wikipedia_en_100_mini_2025-06.zim'
    const zimPath = '/zim/wikipedia_en_100_mini_2025-06.zim'
    const filepath = path.join(process.cwd(), DockerService.NOMAD_STORAGE_PATH, zimPath)
    logger.info(`[DockerService] Kiwix Serve pre-install: Downloading ZIM file to ${filepath}`)

    this._broadcast(
      DockerService.KIWIX_SERVICE_NAME,
      'preinstall',
      `Running pre-install actions for Kiwix Serve...`
    )
    this._broadcast(
      DockerService.KIWIX_SERVICE_NAME,
      'preinstall',
      `Downloading Wikipedia ZIM file from ${WIKIPEDIA_ZIM_URL}. This may take some time...`
    )

    try {
      await doResumableDownloadWithRetry({
        url: WIKIPEDIA_ZIM_URL,
        filepath,
        timeout: 60000,
        allowedMimeTypes: [
          'application/x-zim',
          'application/x-openzim',
          'application/octet-stream',
        ],
      })

      this._broadcast(
        DockerService.KIWIX_SERVICE_NAME,
        'preinstall',
        `Downloaded Wikipedia ZIM file to ${filepath}`
      )
    } catch (error) {
      this._broadcast(
        DockerService.KIWIX_SERVICE_NAME,
        'preinstall-error',
        `Failed to download Wikipedia ZIM file: ${error.message}`
      )
      throw new Error(`Pre-install action failed: ${error.message}`)
    }
  }

  private _broadcast(service: string, status: string, message: string) {
    transmit.broadcast('service-installation', {
      service_name: service,
      timestamp: new Date().toISOString(),
      status,
      message,
    })
    logger.info(`[DockerService] [${service}] ${status}: ${message}`)
  }

  private _parseContainerConfig(containerConfig: any): any {
    if (!containerConfig) {
      return {}
    }

    try {
      // Handle the case where containerConfig is returned as an object by DB instead of a string
      let toParse = containerConfig
      if (typeof containerConfig === 'object') {
        toParse = JSON.stringify(containerConfig)
      }

      return JSON.parse(toParse)
    } catch (error) {
      logger.error(`Failed to parse container configuration: ${error.message}`)
      throw new Error(`Invalid container configuration: ${error.message}`)
    }
  }
}
