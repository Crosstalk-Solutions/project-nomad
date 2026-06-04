import Service from '#models/service'
import Docker from 'dockerode'
import logger from '@adonisjs/core/services/logger'
import { inject } from '@adonisjs/core'
import transmit from '@adonisjs/transmit/services/main'
import { doResumableDownloadWithRetry } from '../utils/downloads.js'
import { join } from 'path'
import { ZIM_STORAGE_PATH } from '../utils/fs.js'
import { KiwixLibraryService } from './kiwix_library_service.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'node:fs/promises'
import KVStore from '#models/kv_store'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'
import { KIWIX_LIBRARY_CMD } from '../../constants/kiwix.js'

@inject()
export class DockerService {
  public docker: Docker
  private activeInstallations: Set<string> = new Set()
  public static NOMAD_NETWORK = 'project-nomad_default'

  private _servicesStatusCache: { data: { service_name: string; status: string }[]; expiresAt: number } | null = null
  private _servicesStatusInflight: Promise<{ service_name: string; status: string }[]> | null = null

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
        this.invalidateServicesStatusCache()
        return {
          success: true,
          message: `Service ${serviceName} stopped successfully`,
        }
      }

      if (action === 'restart') {
        if (serviceName === SERVICE_NAMES.KIWIX) {
          const isLegacy = await this.isKiwixOnLegacyConfig()
          if (isLegacy) {
            logger.info('[DockerService] Kiwix on legacy glob config — running migration instead of restart.')
            await this.migrateKiwixToLibraryMode()
            this.invalidateServicesStatusCache()
            return { success: true, message: 'Kiwix migrated to library mode successfully.' }
          }
        }

        await dockerContainer.restart()
        this.invalidateServicesStatusCache()

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
        this.invalidateServicesStatusCache()

        return {
          success: true,
          message: `Service ${serviceName} started successfully`,
        }
      }

      return {
        success: false,
        message: `Invalid action: ${action}. Use 'start', 'stop', or 'restart'.`,
      }
    } catch (error: any) {
      logger.error({ err: error }, `[DockerService] Error controlling service ${serviceName}`)
      return {
        success: false,
        message: `Failed to ${action} service ${serviceName}. Check server logs for details.`,
      }
    }
  }

  /**
   * Fetches the status of all Docker containers related to Nomad services. (those prefixed with 'nomad_')
   * Results are cached for 5 seconds and concurrent callers share a single in-flight request,
   * preventing Docker socket congestion during rapid page navigation.
   */
  async getServicesStatus(): Promise<{ service_name: string; status: string }[]> {
    const now = Date.now()
    if (this._servicesStatusCache && now < this._servicesStatusCache.expiresAt) {
      return this._servicesStatusCache.data
    }
    if (this._servicesStatusInflight) return this._servicesStatusInflight

    this._servicesStatusInflight = this._fetchServicesStatus().then((data) => {
      this._servicesStatusCache = { data, expiresAt: Date.now() + 5000 }
      this._servicesStatusInflight = null
      return data
    }).catch((err) => {
      this._servicesStatusInflight = null
      throw err
    })
    return this._servicesStatusInflight
  }

  /**
   * Invalidates the services status cache. Call this after any container state change
   * (start, stop, restart, install, uninstall) so the next read reflects reality.
   */
  invalidateServicesStatusCache() {
    this._servicesStatusCache = null
    this._servicesStatusInflight = null
  }

  private async _fetchServicesStatus(): Promise<{ service_name: string; status: string }[]> {
    try {
      const containers = await this.docker.listContainers({ all: true })
      const containerMap = new Map<string, Docker.ContainerInfo>()
      containers.forEach((container) => {
        const name = container.Names[0]?.replace('/', '')
        if (name && name.startsWith('nomad_')) {
          containerMap.set(name, container)
        }
      })

      return Array.from(containerMap.entries()).map(([name, container]) => ({
        service_name: name,
        status: container.State,
      }))
    } catch (error: any) {
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

    if (serviceName === SERVICE_NAMES.OLLAMA) {
      const remoteUrl = await KVStore.getValue('ai.remoteOllamaUrl')
      if (remoteUrl) return remoteUrl
    }

    const service = await Service.query()
      .where('service_name', serviceName)
      .andWhere('installed', true)
      .first()

    if (!service) {
      return null
    }

    const hostname = process.env.NODE_ENV === 'production' ? serviceName : 'localhost'

    // "https:8480" / "http:8480" — explicit scheme + port (e.g. an app serving its own TLS).
    const schemePort = service.ui_location?.match(/^(https?):(\d+)$/)
    if (schemePort) {
      return `${schemePort[1]}://${hostname}:${schemePort[2]}`
    }

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
   *
   * Volume handling: removes Docker-managed named volumes whose name equals
   * `serviceName`, starts with `${serviceName}_`, or carries a `service=${serviceName}`
   * label. Host bind mounts are NOT touched — any data living on a bind-mounted
   * host path (ZIM stores, model caches, MySQL data dir, etc.) survives the reinstall.
   * Anonymous volumes (random hash names) are also not matched.
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
      } catch (error: any) {
        logger.warn({ err: error }, `[DockerService] Error during container cleanup for ${serviceName}`)
        this._broadcast(serviceName, 'cleanup-warning', 'Warning during container cleanup. Check server logs for details.')
      }

      // Step 3: Clear volumes/data if needed
      try {
        this._broadcast(serviceName, 'clearing-volumes', `Checking for volumes to clear...`)
        const volumes = await this.docker.listVolumes()
        const serviceVolumes =
          volumes.Volumes?.filter(
            (v) =>
              v.Name === serviceName ||
              v.Name.startsWith(`${serviceName}_`) ||
              v.Labels?.service === serviceName
          ) || []

        for (const vol of serviceVolumes) {
          try {
            const volume = this.docker.getVolume(vol.Name)
            await volume.remove({ force: true })
            this._broadcast(serviceName, 'volume-removed', `Removed volume: ${vol.Name}`)
          } catch (error: any) {
            logger.warn(`Failed to remove volume ${vol.Name}: ${error.message}`)
          }
        }

        if (serviceVolumes.length === 0) {
          this._broadcast(serviceName, 'no-volumes', `No volumes found to clear`)
        }
      } catch (error: any) {
        logger.warn({ err: error }, `[DockerService] Error during volume cleanup for ${serviceName}`)
        this._broadcast(
          serviceName,
          'volume-cleanup-warning',
          'Warning during volume cleanup. Check server logs for details.'
        )
      }

      // Step 4: Mark service as uninstalled
      service.installed = false
      service.installation_status = 'installing'
      await service.save()
      this.invalidateServicesStatusCache()

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
    } catch (error: any) {
      logger.error({ err: error }, `[DockerService] Force reinstall failed for ${serviceName}`)
      await this._cleanupFailedInstallation(serviceName)
      return {
        success: false,
        message: `Failed to force reinstall service ${serviceName}. Check server logs for details.`,
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
      let amdGpuConfigured = false

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
          // AMD acceleration is opt-out via the 'ai.amdGpuAcceleration' KV key (default-on).
          // Per memory feedback: KV values can be string or boolean — coerce explicitly.
          const amdEnabledRaw = await KVStore.getValue('ai.amdGpuAcceleration')
          const amdAccelerationEnabled = String(amdEnabledRaw) !== 'false'

          if (amdAccelerationEnabled) {
            this._broadcast(
              service.service_name,
              'gpu-config',
              `AMD GPU detected. Using ROCm image with /dev/kfd and /dev/dri passthrough...`
            )

            finalImage = 'ollama/ollama:rocm'

            // The pull-if-missing earlier in this function used service.container_image
            // (the DB-pinned tag, e.g. ollama/ollama:0.18.2). The AMD branch overrides
            // to a different tag — so we need to pull :rocm separately if it's not local.
            const rocmImageExists = await this._checkImageExists(finalImage)
            if (!rocmImageExists) {
              this._broadcast(
                service.service_name,
                'pulling',
                `Pulling Docker image ${finalImage}...`
              )
              const rocmPullStream = await this.docker.pull(finalImage)
              await new Promise((res) => this.docker.modem.followProgress(rocmPullStream, res))
            }

            const amdDevices = await this._discoverAMDDevices()
            gpuHostConfig = {
              ...gpuHostConfig,
              Devices: amdDevices,
            }
            amdGpuConfigured = true
            logger.info(
              `[DockerService] Configured ROCm image and ${amdDevices.length} AMD device entries for Ollama`
            )
          } else {
            this._broadcast(
              service.service_name,
              'gpu-config',
              `AMD GPU detected but acceleration is disabled via ai.amdGpuAcceleration. Using CPU-only configuration.`
            )
            logger.info('[DockerService] AMD GPU acceleration disabled by KV opt-out; using CPU-only configuration.')
          }
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

      const ollamaEnv: string[] = []
      if (service.service_name === SERVICE_NAMES.OLLAMA) {
        ollamaEnv.push('OLLAMA_NO_CLOUD=1')
        const flashAttentionEnabled = await KVStore.getValue('ai.ollamaFlashAttention')
        if (flashAttentionEnabled !== false) {
          ollamaEnv.push('OLLAMA_FLASH_ATTENTION=1')
        }
        if (amdGpuConfigured) {
          // gfx-aware HSA override — only set for cards that actually need it. See
          // _resolveAmdHsaOverride() for the resolution order and gfx → version mapping.
          const hsaOverride = await this._resolveAmdHsaOverride()
          if (hsaOverride) {
            ollamaEnv.push(`HSA_OVERRIDE_GFX_VERSION=${hsaOverride}`)
          }
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
        Labels: {
          ...(containerConfig?.Labels ?? {}),
          'com.docker.compose.project': 'project-nomad-managed',
          'io.project-nomad.managed': 'true',
        },
        ...(containerConfig?.User && { User: containerConfig.User }),
        HostConfig: gpuHostConfig,
        ...(containerConfig?.WorkingDir && { WorkingDir: containerConfig.WorkingDir }),
        ...(containerConfig?.ExposedPorts && { ExposedPorts: containerConfig.ExposedPorts }),
        Env: [...(containerConfig?.Env ?? []), ...ollamaEnv],
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
      this.invalidateServicesStatusCache()

      // Remove from active installs tracking
      this.activeInstallations.delete(service.service_name)

      // If Ollama was just installed, trigger Nomad docs discovery and embedding
      if (service.service_name === SERVICE_NAMES.OLLAMA) {
        logger.info('[DockerService] Ollama installation complete. Default behavior is to not enable chat suggestions.')
        await KVStore.setValue('chat.suggestionsEnabled', false)

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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      logger.error({ err: error }, `[DockerService] Error removing service container ${serviceName}`)
      return {
        success: false,
        message: `Failed to remove service ${serviceName} container. Check server logs for details.`,
      }
    }
  }

  private async _runPreinstallActions__KiwixServe(): Promise<void> {
    /**
     * At least one .zim file must be available before we can start the kiwix container.
     * We'll download the lightweight mini Wikipedia Top 100 zim file for this purpose.
     **/
    const WIKIPEDIA_ZIM_URL =
      'https://github.com/Crosstalk-Solutions/project-nomad/raw/refs/heads/main/install/wikipedia_en_100_mini_2026-01.zim'
    const filename = 'wikipedia_en_100_mini_2026-01.zim'
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

      // Generate the initial kiwix library XML before the container is created
      const kiwixLibraryService = new KiwixLibraryService()
      await kiwixLibraryService.rebuildFromDisk()
      this._broadcast(SERVICE_NAMES.KIWIX, 'preinstall', 'Generated kiwix library XML.')
    } catch (error: any) {
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
        if (service.is_custom) {
          // Custom apps have no seeder definition to fall back to — leaving the row would
          // surface a phantom, un-installable card. Remove the record entirely so a failed
          // install cleanly disappears. (The 'error' broadcast has already fired upstream.)
          await service.delete()
        } else {
          service.installation_status = 'error'
          await service.save()
        }
      }
      this.activeInstallations.delete(serviceName)

      // Ensure any partially created container is removed
      await this._removeServiceContainer(serviceName)

      logger.info(`[DockerService] Cleaned up failed installation for ${serviceName}`)
    } catch (error: any) {
      logger.error(
        `[DockerService] Failed to cleanup installation for ${serviceName}: ${error.message}`
      )
    }
  }

  /**
   * Checks whether the running kiwix container is using the legacy glob-pattern command
   * (`*.zim --address=all`) rather than the library-file command. Used to detect containers
   * that need to be migrated to library mode.
   */
  async isKiwixOnLegacyConfig(): Promise<boolean> {
    try {
      const containers = await this.docker.listContainers({ all: true })
      const info = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.KIWIX}`))
      if (!info) return false

      const inspected = await this.docker.getContainer(info.Id).inspect()
      const cmd: string[] = inspected.Config?.Cmd ?? []
      return cmd.some((arg) => arg.includes('*.zim'))
    } catch (err: any) {
      logger.warn(`[DockerService] Could not inspect kiwix container: ${err.message}`)
      return false
    }
  }

  /**
   * Migrates the kiwix container from legacy glob mode (`*.zim`) to library mode
   * (`--library /data/kiwix-library.xml --monitorLibrary`).
   *
   * This is a non-destructive recreation: ZIM files and volumes are preserved.
   * The container is stopped, removed, and recreated with the correct library-mode command.
   * This function is authoritative: it writes the correct command to the DB itself rather than
   * trusting the DB to have been pre-updated by a separate migration.
   */
  async migrateKiwixToLibraryMode(): Promise<void> {
    if (this.activeInstallations.has(SERVICE_NAMES.KIWIX)) {
      logger.warn('[DockerService] Kiwix migration already in progress, skipping duplicate call.')
      return
    }

    this.activeInstallations.add(SERVICE_NAMES.KIWIX)

    try {
      // Step 1: Build/update the XML from current disk state
      this._broadcast(SERVICE_NAMES.KIWIX, 'migrating', 'Migrating kiwix to library mode...')
      const kiwixLibraryService = new KiwixLibraryService()
      await kiwixLibraryService.rebuildFromDisk()
      this._broadcast(SERVICE_NAMES.KIWIX, 'migrating', 'Built kiwix library XML from existing ZIM files.')

      // Step 2: Stop and remove old container (leave ZIM volumes intact)
      const containers = await this.docker.listContainers({ all: true })
      const containerInfo = containers.find((c) => c.Names.includes(`/${SERVICE_NAMES.KIWIX}`))
      if (containerInfo) {
        const oldContainer = this.docker.getContainer(containerInfo.Id)
        if (containerInfo.State === 'running') {
          await oldContainer.stop({ t: 10 }).catch((e: any) =>
            logger.warn(`[DockerService] Kiwix stop warning during migration: ${e.message}`)
          )
        }
        await oldContainer.remove({ force: true }).catch((e: any) =>
          logger.warn(`[DockerService] Kiwix remove warning during migration: ${e.message}`)
        )
      }

      // Step 3: Read the service record and authoritatively set the correct command.
      // Do NOT rely on prior DB state — we write container_command here so the record
      // stays consistent regardless of whether the DB migration ran.
      const service = await Service.query().where('service_name', SERVICE_NAMES.KIWIX).first()
      if (!service) {
        throw new Error('Kiwix service record not found in DB during migration')
      }

      service.container_command = KIWIX_LIBRARY_CMD
      service.installed = false
      service.installation_status = 'installing'
      await service.save()

      const containerConfig = this._parseContainerConfig(service.container_config)

      // Step 4: Recreate container directly (skipping _createContainer to avoid re-downloading
      // the bootstrap ZIM — ZIM files already exist on disk)
      this._broadcast(SERVICE_NAMES.KIWIX, 'migrating', 'Recreating kiwix container with library mode config...')
      const newContainer = await this.docker.createContainer({
        Image: service.container_image,
        name: service.service_name,
        HostConfig: containerConfig?.HostConfig ?? {},
        ...(containerConfig?.ExposedPorts && { ExposedPorts: containerConfig.ExposedPorts }),
        Cmd: KIWIX_LIBRARY_CMD.split(' '),
        ...(process.env.NODE_ENV === 'production' && {
          NetworkingConfig: {
            EndpointsConfig: {
              [DockerService.NOMAD_NETWORK]: {},
            },
          },
        }),
      })

      await newContainer.start()

      service.installed = true
      service.installation_status = 'idle'
      await service.save()
      this.activeInstallations.delete(SERVICE_NAMES.KIWIX)

      this._broadcast(SERVICE_NAMES.KIWIX, 'migrated', 'Kiwix successfully migrated to library mode.')
      logger.info('[DockerService] Kiwix migration to library mode complete.')
    } catch (error: any) {
      logger.error(`[DockerService] Kiwix migration failed: ${error.message}`)
      await this._cleanupFailedInstallation(SERVICE_NAMES.KIWIX)
      throw error
    }
  }

  /**
   * Detect GPU type and toolkit availability.
   * Primary: Check Docker runtimes via docker.info() (works from inside containers).
   * Secondary: Read /app/storage/.nomad-gpu-type written by install_nomad.sh — needed
   *   for AMD detection because lspci isn't available inside the admin container and
   *   AMD has no Docker runtime registration to query.
   * Fallback: lspci for host-based installs.
   */
  private async _detectGPUType(): Promise<{ type: 'nvidia' | 'amd' | 'none'; toolkitMissing?: boolean }> {
    try {
      // Primary: Check Docker daemon for nvidia runtime (works from inside containers)
      try {
        const dockerInfo = await this.docker.info()
        const runtimes = dockerInfo.Runtimes || {}
        if ('nvidia' in runtimes) {
          logger.info('[DockerService] NVIDIA container runtime detected via Docker API')
          await this._persistGPUType('nvidia')
          return { type: 'nvidia' }
        }
      } catch (error: any) {
        logger.warn(`[DockerService] Could not query Docker info for GPU runtimes: ${error.message}`)
      }

      // Secondary: install_nomad.sh writes the host-detected GPU type to a marker file in
      // the storage volume so the admin container (which lacks lspci) can read it.
      try {
        const marker = (await readFile('/app/storage/.nomad-gpu-type', 'utf8')).trim()
        if (marker === 'nvidia') {
          // Hardware present but Docker doesn't have nvidia runtime → toolkit missing
          logger.warn('[DockerService] NVIDIA GPU recorded in marker file but NVIDIA Container Toolkit is not installed')
          return { type: 'none', toolkitMissing: true }
        }
        if (marker === 'amd') {
          logger.info('[DockerService] AMD GPU detected via install-time marker file')
          await this._persistGPUType('amd')
          return { type: 'amd' }
        }
      } catch {
        // No marker file — fall through to lspci attempt for host-based installs
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
      } catch (error: any) {
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
          await this._persistGPUType('amd')
          return { type: 'amd' }
        }
      } catch (error: any) {
        // lspci not available, continue
      }

      // Last resort: check if we previously detected a GPU and it's likely still present.
      // This handles cases where live detection fails transiently (e.g., Docker daemon
      // hiccup, runtime temporarily unavailable) but the hardware hasn't changed.
      try {
        const savedType = await KVStore.getValue('gpu.type')
        if (savedType === 'nvidia' || savedType === 'amd') {
          logger.info(`[DockerService] No GPU detected live, but KV store has '${savedType}' from previous detection. Using saved value.`)
          return { type: savedType as 'nvidia' | 'amd' }
        }
      } catch {
        // KV store not available, continue
      }

      logger.info('[DockerService] No GPU detected')
      return { type: 'none' }
    } catch (error: any) {
      logger.warn(`[DockerService] Error detecting GPU type: ${error.message}`)
      return { type: 'none' }
    }
  }

  private async _persistGPUType(type: 'nvidia' | 'amd'): Promise<void> {
    try {
      await KVStore.setValue('gpu.type', type)
      logger.info(`[DockerService] Persisted GPU type '${type}' to KV store`)
    } catch (error: any) {
      logger.warn(`[DockerService] Failed to persist GPU type: ${error.message}`)
    }
  }

  /**
   * Resolve the HSA_OVERRIDE_GFX_VERSION value for the host's AMD GPU.
   *
   * gfx1030 (RX 6800/6700/etc.), gfx1100/1101/1102 (RX 7900/7800/7600) are on AMD's
   * official ROCm allowlist — forcing an override on these breaks GPU discovery.
   * gfx1035 / gfx1036 (RDNA 2 iGPUs like 680M) need 10.3.0 to coerce to gfx1030.
   * gfx1103 / gfx1150 / gfx1151 (RDNA 3/3.5 iGPUs like 780M / 890M / Strix Halo) need 11.0.0.
   *
   * Resolution order:
   *   1. KV `ai.amdHsaOverride` — manual user override; accepts 'none' (disable) or a semver-style value.
   *   2. Marker file `/app/storage/.nomad-amd-gfx` written by install_nomad.sh.
   *   3. Default: '11.0.0' — preserves prior behavior so existing iGPU users don't regress on
   *      upgrade. Discrete-card users on existing installs can opt out via the KV.
   *
   * Returns null when no override should be applied.
   */
  private async _resolveAmdHsaOverride(): Promise<string | null> {
    const manualRaw = await KVStore.getValue('ai.amdHsaOverride')
    if (manualRaw !== null && manualRaw !== undefined && String(manualRaw).trim() !== '') {
      const manual = String(manualRaw).trim().toLowerCase()
      if (manual === 'none' || manual === 'off' || manual === 'false') {
        logger.info('[DockerService] HSA override disabled via ai.amdHsaOverride')
        return null
      }
      if (/^\d+\.\d+\.\d+$/.test(manual)) {
        logger.info(`[DockerService] HSA override forced to ${manual} via ai.amdHsaOverride`)
        return manual
      }
      logger.warn(`[DockerService] Ignoring invalid ai.amdHsaOverride value: ${manualRaw}`)
    }

    try {
      const gfx = (await readFile('/app/storage/.nomad-amd-gfx', 'utf8')).trim()
      const mapped = this._mapGfxToHsaOverride(gfx)
      logger.info(`[DockerService] AMD gfx marker '${gfx}' → HSA override ${mapped ?? 'none'}`)
      return mapped
    } catch {
      // Marker absent — most likely an existing install upgraded without re-running
      // install_nomad.sh. Fall through to the default.
    }

    logger.info('[DockerService] No AMD gfx marker; defaulting HSA override to 11.0.0 for backward compatibility')
    return '11.0.0'
  }

  private _mapGfxToHsaOverride(gfx: string): string | null {
    // Officially supported by ROCm — no override needed
    if (gfx === 'gfx1030' || gfx === 'gfx1100' || gfx === 'gfx1101' || gfx === 'gfx1102') {
      return null
    }
    // RDNA 2 variants + iGPUs (gfx1031..gfx1036, e.g. Rembrandt 680M)
    if (/^gfx103[1-6]$/.test(gfx)) {
      return '10.3.0'
    }
    // RDNA 3 / 3.5 mobile parts (Phoenix 780M = gfx1103, Strix 890M = gfx1150, Strix Halo = gfx1151)
    if (gfx === 'gfx1103' || gfx === 'gfx1150' || gfx === 'gfx1151') {
      return '11.0.0'
    }
    return '11.0.0'
  }

  /**
   * Build the Docker Devices array for AMD GPU passthrough.
   *
   * Returns /dev/kfd (Kernel Fusion Driver, required by ROCm) and /dev/dri (the DRM
   * device tree). Passing /dev/dri as a single directory entry mirrors Docker CLI
   * --device behavior — the daemon expands it to all child devices (card*, renderD*)
   * regardless of how the host enumerates them. This avoids the brittle hardcoded
   * fallback (card0/renderD128) the prior implementation used, which was wrong on
   * systems where the AMD GPU enumerates as card1+ (e.g. UM890 Pro 780M iGPU).
   */
  private async _discoverAMDDevices(): Promise<
    Array<{ PathOnHost: string; PathInContainer: string; CgroupPermissions: string }>
  > {
    return [
      { PathOnHost: '/dev/kfd', PathInContainer: '/dev/kfd', CgroupPermissions: 'rwm' },
      { PathOnHost: '/dev/dri', PathInContainer: '/dev/dri', CgroupPermissions: 'rwm' },
    ]
  }

  /**
   * Update a service container to a new image version while preserving volumes and data.
   * Includes automatic rollback if the new container fails health checks.
   */
  async updateContainer(
    serviceName: string,
    targetVersion: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const service = await Service.query().where('service_name', serviceName).first()
      if (!service) {
        return { success: false, message: `Service ${serviceName} not found` }
      }
      if (!service.installed) {
        return { success: false, message: `Service ${serviceName} is not installed` }
      }
      if (this.activeInstallations.has(serviceName)) {
        return { success: false, message: `Service ${serviceName} already has an operation in progress` }
      }

      this.activeInstallations.add(serviceName)

      // newImage = the semver tag we record in the DB after the update (e.g. ollama/ollama:0.23.2).
      // runtimeImage = the tag we actually pull and run. For AMD-on-Ollama these diverge: we run
      // the rolling :rocm tag because per-version ROCm tags aren't always published, but the DB
      // must keep the semver tag so the Apps page shows the actual version (not literally "rocm")
      // and the registry update-check parses a valid tag (instead of looping on the same update).
      const currentImage = service.container_image
      const imageBase = currentImage.includes(':')
        ? currentImage.substring(0, currentImage.lastIndexOf(':'))
        : currentImage
      const newImage = `${imageBase}:${targetVersion}`
      let runtimeImage = newImage

      // GPU detection runs before the pull so AMD updates pull ollama/ollama:rocm rather
      // than the standard tag. Detection result is reused below when building the new
      // container config (devices, env). Non-Ollama services skip this entirely.
      let updatedDeviceRequests: any[] | undefined = undefined
      let updatedAmdDevices: any[] | undefined = undefined
      let updatedAmdGpuConfigured = false
      if (serviceName === SERVICE_NAMES.OLLAMA) {
        const gpuResult = await this._detectGPUType()
        if (gpuResult.type === 'nvidia') {
          this._broadcast(
            serviceName,
            'update-gpu-config',
            `NVIDIA container runtime detected. Configuring updated container with GPU support...`
          )
          updatedDeviceRequests = [
            { Driver: 'nvidia', Count: -1, Capabilities: [['gpu']] },
          ]
        } else if (gpuResult.type === 'amd') {
          const amdEnabledRaw = await KVStore.getValue('ai.amdGpuAcceleration')
          const amdAccelerationEnabled = String(amdEnabledRaw) !== 'false'
          if (amdAccelerationEnabled) {
            this._broadcast(
              serviceName,
              'update-gpu-config',
              `AMD GPU detected. Using ROCm image with /dev/kfd and /dev/dri passthrough...`
            )
            runtimeImage = 'ollama/ollama:rocm'
            updatedAmdDevices = await this._discoverAMDDevices()
            updatedAmdGpuConfigured = true
          } else {
            this._broadcast(
              serviceName,
              'update-gpu-config',
              `AMD GPU detected but acceleration is disabled via ai.amdGpuAcceleration. Using CPU-only configuration.`
            )
          }
        } else if (gpuResult.toolkitMissing) {
          this._broadcast(
            serviceName,
            'update-gpu-config',
            `NVIDIA GPU detected but NVIDIA Container Toolkit is not installed. Using CPU-only configuration. Install the toolkit and reinstall AI Assistant for GPU acceleration: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html`
          )
        } else {
          this._broadcast(serviceName, 'update-gpu-config', `No GPU detected. Using CPU-only configuration.`)
        }
      }

      // Step 1: Pull new image (runtimeImage diverges from newImage for AMD, see above)
      this._broadcast(serviceName, 'update-pulling', `Pulling image ${runtimeImage}...`)
      const pullStream = await this.docker.pull(runtimeImage)
      await new Promise((res) => this.docker.modem.followProgress(pullStream, res))

      // Step 2: Find and stop existing container
      this._broadcast(serviceName, 'update-stopping', `Stopping current container...`)
      const containers = await this.docker.listContainers({ all: true })
      const existingContainer = containers.find((c) => c.Names.includes(`/${serviceName}`))

      if (!existingContainer) {
        this.activeInstallations.delete(serviceName)
        return { success: false, message: `Container for ${serviceName} not found` }
      }

      const oldContainer = this.docker.getContainer(existingContainer.Id)

      // Inspect to capture full config before stopping
      const inspectData = await oldContainer.inspect()

      if (existingContainer.State === 'running') {
        await oldContainer.stop({ t: 15 })
      }

      // Step 3: Rename old container as safety net
      const oldName = `${serviceName}_old`
      await oldContainer.rename({ name: oldName })

      // Step 4: Create new container with inspected config + new image
      this._broadcast(serviceName, 'update-creating', `Creating updated container...`)

      const hostConfig = inspectData.HostConfig || {}

      // GPU detection already ran above (before the pull) so we know the right image, devices,
      // and whether HSA_OVERRIDE needs injection. For AMD, replace any prior HSA_OVERRIDE in
      // the inspect-captured env so updates from older containers pick up the current value.
      const baseEnv = inspectData.Config?.Env || []
      let finalEnv = baseEnv
      if (updatedAmdGpuConfigured) {
        const hsaOverride = await this._resolveAmdHsaOverride()
        finalEnv = baseEnv.filter((e: string) => !e.startsWith('HSA_OVERRIDE_GFX_VERSION='))
        if (hsaOverride) {
          finalEnv.push(`HSA_OVERRIDE_GFX_VERSION=${hsaOverride}`)
        }
      }

      const newContainerConfig: any = {
        Image: runtimeImage,
        name: serviceName,
        Env: finalEnv.length > 0 ? finalEnv : undefined,
        Cmd: inspectData.Config?.Cmd || undefined,
        ExposedPorts: inspectData.Config?.ExposedPorts || undefined,
        WorkingDir: inspectData.Config?.WorkingDir || undefined,
        User: inspectData.Config?.User || undefined,
        HostConfig: {
          Binds: hostConfig.Binds || undefined,
          PortBindings: hostConfig.PortBindings || undefined,
          RestartPolicy: hostConfig.RestartPolicy || undefined,
          DeviceRequests: serviceName === SERVICE_NAMES.OLLAMA ? updatedDeviceRequests : (hostConfig.DeviceRequests || undefined),
          Devices: serviceName === SERVICE_NAMES.OLLAMA && updatedAmdDevices ? updatedAmdDevices : (hostConfig.Devices || undefined),
        },
        NetworkingConfig: inspectData.NetworkSettings?.Networks
          ? {
              EndpointsConfig: Object.fromEntries(
                Object.keys(inspectData.NetworkSettings.Networks).map((net) => [net, {}])
              ),
            }
          : undefined,
      }

      // Remove undefined values from HostConfig
      Object.keys(newContainerConfig.HostConfig).forEach((key) => {
        if (newContainerConfig.HostConfig[key] === undefined) {
          delete newContainerConfig.HostConfig[key]
        }
      })

      let newContainer: any
      try {
        newContainer = await this.docker.createContainer(newContainerConfig)
      } catch (createError: any) {
        // Rollback: rename old container back
        this._broadcast(serviceName, 'update-rollback', `Failed to create new container: ${createError.message}. Rolling back...`)
        const rollbackContainer = this.docker.getContainer((await this.docker.listContainers({ all: true })).find((c) => c.Names.includes(`/${oldName}`))!.Id)
        await rollbackContainer.rename({ name: serviceName })
        await rollbackContainer.start()
        this.activeInstallations.delete(serviceName)
        return { success: false, message: `Failed to create updated container: ${createError.message}` }
      }

      // Step 5: Start new container
      this._broadcast(serviceName, 'update-starting', `Starting updated container...`)
      await newContainer.start()

      // Step 6: Health check — verify container stays running for 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000))
      const newContainerInfo = await newContainer.inspect()

      if (newContainerInfo.State?.Running) {
        // Healthy — clean up old container
        try {
          const oldContainerRef = this.docker.getContainer(
            (await this.docker.listContainers({ all: true })).find((c) =>
              c.Names.includes(`/${oldName}`)
            )?.Id || ''
          )
          await oldContainerRef.remove({ force: true })
        } catch {
          // Old container may already be gone
        }

        // Update DB
        service.container_image = newImage
        service.available_update_version = null
        await service.save()

        this.activeInstallations.delete(serviceName)
        this._broadcast(
          serviceName,
          'update-complete',
          `Successfully updated ${serviceName} to ${targetVersion}`
        )
        return { success: true, message: `Service ${serviceName} updated to ${targetVersion}` }
      } else {
        // Unhealthy — rollback
        this._broadcast(
          serviceName,
          'update-rollback',
          `New container failed health check. Rolling back to previous version...`
        )

        try {
          await newContainer.stop({ t: 5 }).catch(() => {})
          await newContainer.remove({ force: true })
        } catch {
          // Best effort cleanup
        }

        // Restore old container
        const oldContainers = await this.docker.listContainers({ all: true })
        const oldRef = oldContainers.find((c) => c.Names.includes(`/${oldName}`))
        if (oldRef) {
          const rollbackContainer = this.docker.getContainer(oldRef.Id)
          await rollbackContainer.rename({ name: serviceName })
          await rollbackContainer.start()
        }

        this.activeInstallations.delete(serviceName)
        return {
          success: false,
          message: `Update failed: new container did not stay running. Rolled back to previous version.`,
        }
      }
    } catch (error: any) {
      this.activeInstallations.delete(serviceName)
      this._broadcast(
        serviceName,
        'update-rollback',
        'Update failed. Check server logs for details.'
      )
      logger.error({ err: error }, `[DockerService] Update failed for ${serviceName}`)
      return { success: false, message: 'Update failed. Check server logs for details.' }
    }
  }

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
    } catch (error: any) {
      logger.error(`Failed to parse container configuration: ${error.message}`)
      throw new Error(`Invalid container configuration: ${error.message}`)
    }
  }

  /**
   * Check whether any of the supplied host ports are already bound by a running or stopped
   * Docker container. Uses the Docker API exclusively — probing ports via net.createServer()
   * would only test the admin container's own network namespace (DooD pattern), not the host.
   */
  async checkPortConflicts(
    ports: number[]
  ): Promise<{ conflicts: { port: number; usedBy: string }[] }> {
    if (!ports.length) return { conflicts: [] }

    try {
      const containers = await this.docker.listContainers({ all: true })
      const bound = new Map<number, string>()

      for (const c of containers) {
        const name = (c.Names[0] || '').replace('/', '')
        for (const p of c.Ports) {
          if (p.PublicPort) bound.set(p.PublicPort, name || c.Id.slice(0, 12))
        }
      }

      const conflicts = ports
        .filter((p) => bound.has(p))
        .map((p) => ({ port: p, usedBy: bound.get(p)! }))

      return { conflicts }
    } catch (error: any) {
      logger.warn(`[DockerService] checkPortConflicts failed: ${error.message}`)
      return { conflicts: [] }
    }
  }

  /**
   * Remove a custom-app container and, when `removeImage` is set, its backing image too. Called
   * before deleting the DB record. Image removal is best-effort: a shared/in-use image is left alone.
   */
  async removeCustomAppContainer(
    serviceName: string,
    removeImage = false
  ): Promise<{ success: boolean; message: string }> {
    try {
      const containers = await this.docker.listContainers({ all: true })
      const container = containers.find((c) => c.Names.includes(`/${serviceName}`))

      if (!container) return { success: true, message: 'No container found — nothing to remove' }

      const imageRef = container.Image
      const c = this.docker.getContainer(container.Id)
      if (container.State === 'running') await c.stop()
      await c.remove({ force: true })

      if (removeImage && imageRef) {
        try {
          await this.docker.getImage(imageRef).remove()
        } catch (imgErr: any) {
          // Non-fatal: the image may be shared with another container or already gone.
          logger.warn(`[DockerService] Could not remove image ${imageRef} for ${serviceName}: ${imgErr.message}`)
        }
      }

      this.invalidateServicesStatusCache()
      return { success: true, message: `Container ${serviceName} removed` }
    } catch (error: any) {
      logger.error({ err: error }, `[DockerService] removeCustomAppContainer failed for ${serviceName}`)
      return { success: false, message: error.message }
    }
  }

  /** Find a container by its managed service name (`/serviceName`), or null. */
  private async _findContainerByName(serviceName: string) {
    const containers = await this.docker.listContainers({ all: true })
    return containers.find((c) => c.Names.includes(`/${serviceName}`)) ?? null
  }

  /**
   * Decode the multiplexed stream Docker returns for non-TTY container logs. Each frame is an
   * 8-byte header ([streamType, 0,0,0, big-endian payloadSize]) followed by the payload.
   */
  private _demuxDockerLog(buf: Buffer): string {
    let out = ''
    let offset = 0
    while (offset + 8 <= buf.length) {
      const size = buf.readUInt32BE(offset + 4)
      offset += 8
      if (offset + size > buf.length) {
        out += buf.toString('utf8', offset)
        break
      }
      out += buf.toString('utf8', offset, offset + size)
      offset += size
    }
    return out
  }

  /** Return the last `tail` lines of a service container's combined stdout/stderr. */
  async getContainerLogs(
    serviceName: string,
    tail = 200
  ): Promise<{ success: boolean; logs?: string; message?: string }> {
    try {
      const info = await this._findContainerByName(serviceName)
      if (!info) return { success: false, message: `No container found for ${serviceName}` }

      const container = this.docker.getContainer(info.Id)
      const inspect = await container.inspect()
      const tty = inspect.Config?.Tty ?? false

      const buf = (await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
        tail,
        timestamps: false,
      })) as unknown as Buffer

      const logs = tty ? buf.toString('utf8') : this._demuxDockerLog(buf)
      return { success: true, logs }
    } catch (error: any) {
      logger.error({ err: error }, `[DockerService] getContainerLogs failed for ${serviceName}`)
      return { success: false, message: error.message }
    }
  }

  /**
   * Return a single resource-usage snapshot (CPU %, memory) for a running service container.
   * Uses Docker's non-streaming stats, which include precpu_stats so CPU % is computable.
   */
  async getContainerStats(serviceName: string): Promise<{
    success: boolean
    running?: boolean
    stats?: { cpuPercent: number; memUsageBytes: number; memLimitBytes: number; memPercent: number }
    message?: string
  }> {
    try {
      const info = await this._findContainerByName(serviceName)
      if (!info) return { success: false, message: `No container found for ${serviceName}` }
      if (info.State !== 'running') return { success: true, running: false }

      const container = this.docker.getContainer(info.Id)
      const s: any = await container.stats({ stream: false })

      const cpuDelta =
        (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0)
      const systemDelta =
        (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0)
      const numCpus =
        s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1
      const cpuPercent =
        systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0

      // Subtract page cache from usage to better reflect the container's working set.
      const cache = s.memory_stats?.stats?.cache ?? s.memory_stats?.stats?.inactive_file ?? 0
      const memUsageBytes = Math.max(0, (s.memory_stats?.usage ?? 0) - cache)
      const memLimitBytes = s.memory_stats?.limit ?? 0
      const memPercent = memLimitBytes > 0 ? (memUsageBytes / memLimitBytes) * 100 : 0

      return {
        success: true,
        running: true,
        stats: {
          cpuPercent: Math.round(cpuPercent * 10) / 10,
          memUsageBytes,
          memLimitBytes,
          memPercent: Math.round(memPercent * 10) / 10,
        },
      }
    } catch (error: any) {
      logger.error({ err: error }, `[DockerService] getContainerStats failed for ${serviceName}`)
      return { success: false, message: error.message }
    }
  }

  /**
   * Wait for a freshly started container to be "ready". If the image declares a HEALTHCHECK we poll
   * its health until healthy/unhealthy (up to timeoutMs); otherwise we fall back to a 5s settle and
   * a plain Running check. Returns whether it's ready plus a reason when not.
   */
  private async _awaitContainerReady(
    container: any,
    timeoutMs = 30000
  ): Promise<{ ready: boolean; reason?: string }> {
    let inspect = await container.inspect()
    const hasHealthcheck = !!inspect.State?.Health

    if (!hasHealthcheck) {
      await new Promise((r) => setTimeout(r, 5000))
      inspect = await container.inspect()
      return inspect.State?.Running
        ? { ready: true }
        : { ready: false, reason: 'container did not stay running' }
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      inspect = await container.inspect()
      if (!inspect.State?.Running) return { ready: false, reason: 'container exited' }
      const status = inspect.State?.Health?.Status
      if (status === 'healthy') return { ready: true }
      if (status === 'unhealthy') return { ready: false, reason: 'failed its health check' }
      await new Promise((r) => setTimeout(r, 2000))
    }
    // Still in "starting" at timeout — accept it if it's at least running rather than roll back a slow boot.
    return inspect.State?.Running ? { ready: true } : { ready: false, reason: 'health check timed out' }
  }

  /**
   * Recreate a custom app's container from its (already-updated) Service record, preserving data.
   * Uses the same rename-and-rollback safety net as the update flow: the live container is renamed
   * aside, a new one is created from the new config/image, health-gated, and only then is the old one
   * removed — otherwise we roll back to it. Bind-mounted data is untouched throughout. Pass
   * `forcePull` to always re-pull the image first (used by the "update" action for moving tags).
   */
  async recreateCustomAppContainer(
    serviceName: string,
    opts: { forcePull?: boolean } = {}
  ): Promise<{ success: boolean; message: string }> {
    const service = await Service.query().where('service_name', serviceName).first()
    if (!service) return { success: false, message: `Service ${serviceName} not found` }

    const containerConfig = this._parseContainerConfig(service.container_config)
    const oldInfo = await this._findContainerByName(serviceName)
    const oldName = `${serviceName}_old`

    // Clear any stale `_old` left behind by a previous recreate that died mid-flight. Without this,
    // the rename below would fail (name in use) and the rollback path would then destroy the live
    // container and resurrect the stale one in its place.
    const staleOld = await this._findContainerByName(oldName)
    if (staleOld) {
      await this.docker.getContainer(staleOld.Id).remove({ force: true }).catch(() => {})
    }

    try {
      // Stop + rename the existing container aside as a rollback safety net.
      if (oldInfo) {
        const oldContainer = this.docker.getContainer(oldInfo.Id)
        if (oldInfo.State === 'running') await oldContainer.stop({ t: 10 }).catch(() => {})
        await oldContainer.rename({ name: oldName })
      }

      // Pull the image if it's missing locally, or always when forcePull (e.g. :latest updates).
      if (opts.forcePull || !(await this._checkImageExists(service.container_image))) {
        const pullStream = await this.docker.pull(service.container_image)
        await new Promise((res) => this.docker.modem.followProgress(pullStream, res))
      }

      const newContainer = await this.docker.createContainer({
        Image: service.container_image,
        name: serviceName,
        Labels: {
          ...(containerConfig?.Labels ?? {}),
          'com.docker.compose.project': 'project-nomad-managed',
          'io.project-nomad.managed': 'true',
        },
        ...(containerConfig?.User && { User: containerConfig.User }),
        HostConfig: containerConfig?.HostConfig ?? {},
        ...(containerConfig?.ExposedPorts && { ExposedPorts: containerConfig.ExposedPorts }),
        ...(containerConfig?.Env && { Env: containerConfig.Env }),
        ...(service.container_command ? { Cmd: service.container_command.split(' ') } : {}),
        ...(process.env.NODE_ENV === 'production' && {
          NetworkingConfig: { EndpointsConfig: { [DockerService.NOMAD_NETWORK]: {} } },
        }),
      })
      await newContainer.start()

      // Health gate before discarding the old container.
      const readiness = await this._awaitContainerReady(newContainer)
      if (!readiness.ready) throw new Error(`recreated container ${readiness.reason}`)

      if (oldInfo) {
        const oldRef = await this._findContainerByName(oldName)
        if (oldRef) await this.docker.getContainer(oldRef.Id).remove({ force: true })
      }
      service.installed = true
      service.installation_status = 'idle'
      await service.save()
      this.invalidateServicesStatusCache()
      return { success: true, message: `Service ${serviceName} reconfigured successfully` }
    } catch (error: any) {
      logger.error({ err: error }, `[DockerService] recreateCustomAppContainer failed for ${serviceName}`)
      // Roll back: discard the failed new container and restore the renamed original.
      try {
        const failedNew = await this._findContainerByName(serviceName)
        if (failedNew) {
          const c = this.docker.getContainer(failedNew.Id)
          await c.stop({ t: 5 }).catch(() => {})
          await c.remove({ force: true }).catch(() => {})
        }
        const renamed = await this._findContainerByName(oldName)
        if (renamed) {
          const c = this.docker.getContainer(renamed.Id)
          await c.rename({ name: serviceName })
          await c.start().catch(() => {})
        }
      } catch (rollbackError: any) {
        logger.error({ err: rollbackError }, `[DockerService] rollback failed for ${serviceName}`)
      }
      this.invalidateServicesStatusCache()
      return { success: false, message: `Reconfigure failed and was rolled back: ${error.message}` }
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
    } catch (error: any) {
      logger.warn(`Error checking if image exists: ${error.message}`)
      // If run into an error, assume the image does not exist
      return false
    }
  }
}
