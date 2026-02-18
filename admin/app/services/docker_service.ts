import Service from '#models/service'
import Docker from 'dockerode'
import logger from '@adonisjs/core/services/logger'
import { inject } from '@adonisjs/core'
import transmit from '@adonisjs/transmit/services/main'
import { doResumableDownloadWithRetry } from '../utils/downloads.js'
import { join } from 'path'
import { ZIM_STORAGE_PATH } from '../utils/fs.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { exec } from 'child_process'
import { promisify } from 'util'
// import { readdir } from 'fs/promises'
import KVStore from '#models/kv_store'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'

@inject()
export class DockerService {
  public docker: Docker
  private activeInstallations: Set<string> = new Set()
  public static NOMAD_NETWORK = 'project-nomad_default'

  constructor() {
    // Support both Linux (production) and Windows (development with Docker Desktop)
    const isWindows = process.platform === 'win32'
    if (isWindows) {
      // Windows Docker Desktop uses named pipe
      this.docker = new Docker({ socketPath: '//./pipe/docker_engine' })
    } else {
      // Linux uses Unix socket
      this.docker = new Docker({ socketPath: '/var/run/docker.sock' })
    }
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

  /**
   * Fetches the status of all Docker containers related to Nomad services. (those prefixed with 'nomad_')
   */
  async getServicesStatus(): Promise<
    {
      service_name: string
      status: string
    }[]
  > {
    try {
      const containers = await this.docker.listContainers({ all: true })
      const containerMap = new Map<string, Docker.ContainerInfo>()
      containers.forEach((container) => {
        const name = container.Names[0].replace('/', '')
        if (name.startsWith('nomad_')) {
          containerMap.set(name, container)
        }
      })

      return Array.from(containerMap.entries()).map(([name, container]) => ({
        service_name: name,
        status: container.State,
      }))
    } catch (error) {
      logger.error(`Error fetching services status: ${error.message}`)
      return []
    }
  }

  /**
   * Get the URL to access a service based on its configuration.
   * Attempts to return a docker-internal URL using the service name and exposed port.
   * @param serviceName - The name of the service to get the URL for.
   * @returns - The URL as a string, or null if it cannot be determined.
   */
  async getServiceURL(serviceName: string): Promise<string | null> {
    if (!serviceName || serviceName.trim() === '') {
      return null
    }

    const service = await Service.query()
      .where('service_name', serviceName)
      .andWhere('installed', true)
      .first()

    if (!service) {
      return null
    }

    const hostname = process.env.NODE_ENV === 'production' ? serviceName : 'localhost'

    // First, check if ui_location is set and is a valid port number
    if (service.ui_location && parseInt(service.ui_location, 10)) {
      return `http://${hostname}:${service.ui_location}`
    }

    // Next, try to extract a host port from container_config
    const parsedConfig = this._parseContainerConfig(service.container_config)
    if (parsedConfig?.HostConfig?.PortBindings) {
      const portBindings = parsedConfig.HostConfig.PortBindings
      const hostPorts = Object.values(portBindings)
      if (!hostPorts || !Array.isArray(hostPorts) || hostPorts.length === 0) {
        return null
      }

      const hostPortsArray = hostPorts.flat() as { HostPort: string }[]
      const hostPortsStrings = hostPortsArray.map((binding) => binding.HostPort)
      if (hostPortsStrings.length > 0) {
        return `http://${hostname}:${hostPortsStrings[0]}`
      }
    }

    // Otherwise, return null if we can't determine a URL
    return null
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

    // Check if installation is already in progress (database-level)
    if (service.installation_status === 'installing') {
      return {
        success: false,
        message: `Service ${serviceName} installation is already in progress`,
      }
    }

    // Double-check with in-memory tracking (race condition protection)
    if (this.activeInstallations.has(serviceName)) {
      return {
        success: false,
        message: `Service ${serviceName} installation is already in progress`,
      }
    }

    // Mark installation as in progress
    this.activeInstallations.add(serviceName)
    service.installation_status = 'installing'
    await service.save()

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

    // Execute installation asynchronously and handle cleanup
    this._createContainer(service, containerConfig).catch(async (error) => {
      logger.error(`Installation failed for ${serviceName}: ${error.message}`)
      await this._cleanupFailedInstallation(serviceName)
    })

    return {
      success: true,
      message: `Service ${serviceName} installation initiated successfully. You can receive updates via server-sent events.`,
    }
  }

  /**
   * Force reinstall a service by stopping, removing, and recreating its container.
   * This method will also clear any associated volumes/data.
   * Handles edge cases gracefully (e.g., container not running, container not found).
   */
  async forceReinstall(serviceName: string): Promise<{ success: boolean; message: string }> {
    try {
      const service = await Service.query().where('service_name', serviceName).first()
      if (!service) {
        return {
          success: false,
          message: `Service ${serviceName} not found`,
        }
      }

      // Check if installation is already in progress
      if (this.activeInstallations.has(serviceName)) {
        return {
          success: false,
          message: `Service ${serviceName} installation is already in progress`,
        }
      }

      // Mark as installing to prevent concurrent operations
      this.activeInstallations.add(serviceName)
      service.installation_status = 'installing'
      await service.save()

      this._broadcast(
        serviceName,
        'reinstall-starting',
        `Starting force reinstall for ${serviceName}...`
      )

      // Step 1: Try to stop and remove the container if it exists
      try {
        const containers = await this.docker.listContainers({ all: true })
        const container = containers.find((c) => c.Names.includes(`/${serviceName}`))

        if (container) {
          const dockerContainer = this.docker.getContainer(container.Id)

          // Only try to stop if it's running
          if (container.State === 'running') {
            this._broadcast(serviceName, 'stopping', `Stopping container...`)
            await dockerContainer.stop({ t: 10 }).catch((error) => {
              // If already stopped, continue
              if (!error.message.includes('already stopped')) {
                logger.warn(`Error stopping container: ${error.message}`)
              }
            })
          }

          // Step 2: Remove the container
          this._broadcast(serviceName, 'removing', `Removing container...`)
          await dockerContainer.remove({ force: true }).catch((error) => {
            logger.warn(`Error removing container: ${error.message}`)
          })
        } else {
          this._broadcast(
            serviceName,
            'no-container',
            `No existing container found, proceeding with installation...`
          )
        }
      } catch (error) {
        logger.warn(`Error during container cleanup: ${error.message}`)
        this._broadcast(serviceName, 'cleanup-warning', `Warning during cleanup: ${error.message}`)
      }

      // Step 3: Clear volumes/data if needed
      try {
        this._broadcast(serviceName, 'clearing-volumes', `Checking for volumes to clear...`)
        const volumes = await this.docker.listVolumes()
        const serviceVolumes =
          volumes.Volumes?.filter(
            (v) => v.Name.includes(serviceName) || v.Labels?.service === serviceName
          ) || []

        for (const vol of serviceVolumes) {
          try {
            const volume = this.docker.getVolume(vol.Name)
            await volume.remove({ force: true })
            this._broadcast(serviceName, 'volume-removed', `Removed volume: ${vol.Name}`)
          } catch (error) {
            logger.warn(`Failed to remove volume ${vol.Name}: ${error.message}`)
          }
        }

        if (serviceVolumes.length === 0) {
          this._broadcast(serviceName, 'no-volumes', `No volumes found to clear`)
        }
      } catch (error) {
        logger.warn(`Error during volume cleanup: ${error.message}`)
        this._broadcast(
          serviceName,
          'volume-cleanup-warning',
          `Warning during volume cleanup: ${error.message}`
        )
      }

      // Step 4: Mark service as uninstalled
      service.installed = false
      service.installation_status = 'installing'
      await service.save()

      // Step 5: Recreate the container
      this._broadcast(serviceName, 'recreating', `Recreating container...`)
      const containerConfig = this._parseContainerConfig(service.container_config)

      // Execute installation asynchronously and handle cleanup
      this._createContainer(service, containerConfig).catch(async (error) => {
        logger.error(`Reinstallation failed for ${serviceName}: ${error.message}`)
        await this._cleanupFailedInstallation(serviceName)
      })

      return {
        success: true,
        message: `Service ${serviceName} force reinstall initiated successfully. You can receive updates via server-sent events.`,
      }
    } catch (error) {
      logger.error(`Force reinstall failed for ${serviceName}: ${error.message}`)
      await this._cleanupFailedInstallation(serviceName)
      return {
        success: false,
        message: `Failed to force reinstall service ${serviceName}: ${error.message}`,
      }
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

      const imageExists = await this._checkImageExists(service.container_image)
      if (imageExists) {
        this._broadcast(
          service.service_name,
          'image-exists',
          `Docker image ${service.container_image} already exists locally. Skipping pull...`
        )
      } else {
        // Start pulling the Docker image and wait for it to complete
        const pullStream = await this.docker.pull(service.container_image)
        this._broadcast(
          service.service_name,
          'pulling',
          `Pulling Docker image ${service.container_image}...`
        )
        await new Promise((res) => this.docker.modem.followProgress(pullStream, res))
      }

      if (service.service_name === SERVICE_NAMES.KIWIX) {
        await this._runPreinstallActions__KiwixServe()
        this._broadcast(
          service.service_name,
          'preinstall-complete',
          `Pre-install actions for Kiwix Serve completed successfully.`
        )
      }

      // GPU-aware configuration for Ollama
      let finalImage = service.container_image
      let gpuHostConfig = containerConfig?.HostConfig || {}

      if (service.service_name === SERVICE_NAMES.OLLAMA) {
        const gpuResult = await this._detectGPUType()

        if (gpuResult.type === 'nvidia') {
          this._broadcast(
            service.service_name,
            'gpu-config',
            `NVIDIA container runtime detected. Configuring container with GPU support...`
          )

          // Add GPU support for NVIDIA
          gpuHostConfig = {
            ...gpuHostConfig,
            DeviceRequests: [
              {
                Driver: 'nvidia',
                Count: -1, // -1 means all GPUs
                Capabilities: [['gpu']],
              },
            ],
          }
        } else if (gpuResult.type === 'amd') {
          this._broadcast(
            service.service_name,
            'gpu-config',
            `AMD GPU detected. ROCm GPU acceleration is not yet supported in this version — proceeding with CPU-only configuration. GPU support for AMD will be available in a future update.`
          )
          logger.warn('[DockerService] AMD GPU detected but ROCm support is not yet enabled. Using CPU-only configuration.')
          // TODO: Re-enable AMD GPU support once ROCm image and device discovery are validated.
          // When re-enabling:
          //   1. Switch image to 'ollama/ollama:rocm'
          //   2. Restore _discoverAMDDevices() to map /dev/kfd and /dev/dri/* into the container
        } else if (gpuResult.toolkitMissing) {
          this._broadcast(
            service.service_name,
            'gpu-config',
            `NVIDIA GPU detected but NVIDIA Container Toolkit is not installed. Using CPU-only configuration. Install the toolkit and reinstall AI Assistant for GPU acceleration: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html`
          )
        } else {
          this._broadcast(
            service.service_name,
            'gpu-config',
            `No GPU detected. Using CPU-only configuration...`
          )
        }
      }

      this._broadcast(
        service.service_name,
        'creating',
        `Creating Docker container for service ${service.service_name}...`
      )
      const container = await this.docker.createContainer({
        Image: finalImage,
        name: service.service_name,
        ...(containerConfig?.User && { User: containerConfig.User }),
        HostConfig: gpuHostConfig,
        ...(containerConfig?.WorkingDir && { WorkingDir: containerConfig.WorkingDir }),
        ...(containerConfig?.ExposedPorts && { ExposedPorts: containerConfig.ExposedPorts }),
        ...(containerConfig?.Env && { Env: containerConfig.Env }),
        ...(service.container_command ? { Cmd: service.container_command.split(' ') } : {}),
        // Ensure container is attached to the Nomad docker network in production
        ...(process.env.NODE_ENV === 'production' && {
          NetworkingConfig: {
            EndpointsConfig: {
              [DockerService.NOMAD_NETWORK]: {},
            },
          },
        }),
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
      service.installation_status = 'idle'
      await service.save()

      // Remove from active installs tracking
      this.activeInstallations.delete(service.service_name)

      // If Ollama was just installed, trigger Nomad docs discovery and embedding
      if (service.service_name === SERVICE_NAMES.OLLAMA) {
        logger.info('[DockerService] Ollama installation complete. Default behavior is to not enable chat suggestions.')
        await KVStore.setValue('chat.suggestionsEnabled', "false")

        logger.info('[DockerService] Ollama installation complete. Triggering Nomad docs discovery...')
        
        // Need to use dynamic imports here to avoid circular dependency
        const ollamaService = new (await import('./ollama_service.js')).OllamaService()
        const ragService = new (await import('./rag_service.js')).RagService(this, ollamaService)

        ragService.discoverNomadDocs().catch((error) => {
          logger.error('[DockerService] Failed to discover Nomad docs:', error)
        })
      }

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
      // Mark install as failed and cleanup
      await this._cleanupFailedInstallation(service.service_name)
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
      await dockerContainer.remove({ force: true })

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
    const filename = 'wikipedia_en_100_mini_2025-06.zim'
    const filepath = join(process.cwd(), ZIM_STORAGE_PATH, filename)
    logger.info(`[DockerService] Kiwix Serve pre-install: Downloading ZIM file to ${filepath}`)

    this._broadcast(
      SERVICE_NAMES.KIWIX,
      'preinstall',
      `Running pre-install actions for Kiwix Serve...`
    )
    this._broadcast(
      SERVICE_NAMES.KIWIX,
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
        SERVICE_NAMES.KIWIX,
        'preinstall',
        `Downloaded Wikipedia ZIM file to ${filepath}`
      )
    } catch (error) {
      this._broadcast(
        SERVICE_NAMES.KIWIX,
        'preinstall-error',
        `Failed to download Wikipedia ZIM file: ${error.message}`
      )
      throw new Error(`Pre-install action failed: ${error.message}`)
    }
  }

  private async _cleanupFailedInstallation(serviceName: string): Promise<void> {
    try {
      const service = await Service.query().where('service_name', serviceName).first()
      if (service) {
        service.installation_status = 'error'
        await service.save()
      }
      this.activeInstallations.delete(serviceName)

      // Ensure any partially created container is removed
      await this._removeServiceContainer(serviceName)

      logger.info(`[DockerService] Cleaned up failed installation for ${serviceName}`)
    } catch (error) {
      logger.error(
        `[DockerService] Failed to cleanup installation for ${serviceName}: ${error.message}`
      )
    }
  }

  /**
   * Detect GPU type and toolkit availability.
   * Primary: Check Docker runtimes via docker.info() (works from inside containers).
   * Fallback: lspci for host-based installs and AMD detection.
   */
  private async _detectGPUType(): Promise<{ type: 'nvidia' | 'amd' | 'none'; toolkitMissing?: boolean }> {
    try {
      // Primary: Check Docker daemon for nvidia runtime (works from inside containers)
      try {
        const dockerInfo = await this.docker.info()
        const runtimes = dockerInfo.Runtimes || {}
        if ('nvidia' in runtimes) {
          logger.info('[DockerService] NVIDIA container runtime detected via Docker API')
          return { type: 'nvidia' }
        }
      } catch (error) {
        logger.warn(`[DockerService] Could not query Docker info for GPU runtimes: ${error.message}`)
      }

      // Fallback: lspci for host-based installs (not available inside Docker)
      const execAsync = promisify(exec)

      // Check for NVIDIA GPU via lspci
      try {
        const { stdout: nvidiaCheck } = await execAsync(
          'lspci 2>/dev/null | grep -i nvidia || true'
        )
        if (nvidiaCheck.trim()) {
          // GPU hardware found but no nvidia runtime — toolkit not installed
          logger.warn('[DockerService] NVIDIA GPU detected via lspci but NVIDIA Container Toolkit is not installed')
          return { type: 'none', toolkitMissing: true }
        }
      } catch (error) {
        // lspci not available (likely inside Docker container), continue
      }

      // Check for AMD GPU via lspci — restrict to display controller classes to avoid
      // false positives from AMD CPU host bridges, PCI bridges, and chipset devices.
      try {
        const { stdout: amdCheck } = await execAsync(
          'lspci 2>/dev/null | grep -iE "VGA|3D controller|Display" | grep -iE "amd|radeon" || true'
        )
        if (amdCheck.trim()) {
          logger.info('[DockerService] AMD GPU detected via lspci')
          return { type: 'amd' }
        }
      } catch (error) {
        // lspci not available, continue
      }

      logger.info('[DockerService] No GPU detected')
      return { type: 'none' }
    } catch (error) {
      logger.warn(`[DockerService] Error detecting GPU type: ${error.message}`)
      return { type: 'none' }
    }
  }

  /**
   * Discover AMD GPU DRI devices dynamically.
   * Returns an array of device configurations for Docker.
   */
  // private async _discoverAMDDevices(): Promise<
  //   Array<{ PathOnHost: string; PathInContainer: string; CgroupPermissions: string }>
  // > {
  //   try {
  //     const devices: Array<{
  //       PathOnHost: string
  //       PathInContainer: string
  //       CgroupPermissions: string
  //     }> = []

  //     // Always add /dev/kfd (Kernel Fusion Driver)
  //     devices.push({
  //       PathOnHost: '/dev/kfd',
  //       PathInContainer: '/dev/kfd',
  //       CgroupPermissions: 'rwm',
  //     })

  //     // Discover DRI devices in /dev/dri/
  //     try {
  //       const driDevices = await readdir('/dev/dri')
  //       for (const device of driDevices) {
  //         const devicePath = `/dev/dri/${device}`
  //         devices.push({
  //           PathOnHost: devicePath,
  //           PathInContainer: devicePath,
  //           CgroupPermissions: 'rwm',
  //         })
  //       }
  //       logger.info(
  //         `[DockerService] Discovered ${driDevices.length} DRI devices: ${driDevices.join(', ')}`
  //       )
  //     } catch (error) {
  //       logger.warn(`[DockerService] Could not read /dev/dri directory: ${error.message}`)
  //       // Fallback to common device names if directory read fails
  //       const fallbackDevices = ['card0', 'renderD128']
  //       for (const device of fallbackDevices) {
  //         devices.push({
  //           PathOnHost: `/dev/dri/${device}`,
  //           PathInContainer: `/dev/dri/${device}`,
  //           CgroupPermissions: 'rwm',
  //         })
  //       }
  //       logger.info(`[DockerService] Using fallback DRI devices: ${fallbackDevices.join(', ')}`)
  //     }

  //     return devices
  //   } catch (error) {
  //     logger.error(`[DockerService] Error discovering AMD devices: ${error.message}`)
  //     return []
  //   }
  // }

  private _broadcast(service: string, status: string, message: string) {
    transmit.broadcast(BROADCAST_CHANNELS.SERVICE_INSTALLATION, {
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

  /**
   * Check if a Docker image exists locally.
   * @param imageName - The name and tag of the image (e.g., "nginx:latest")
   * @returns - True if the image exists locally, false otherwise
   */
  private async _checkImageExists(imageName: string): Promise<boolean> {
    try {
      const images = await this.docker.listImages()

      // Check if any image has a RepoTag that matches the requested image
      return images.some((image) => image.RepoTags && image.RepoTags.includes(imageName))
    } catch (error) {
      logger.warn(`Error checking if image exists: ${error.message}`)
      // If run into an error, assume the image does not exist
      return false
    }
  }
}
