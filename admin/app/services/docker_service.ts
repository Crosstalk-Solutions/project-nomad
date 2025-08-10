import Service from "#models/service";
import Docker from "dockerode";
import drive from '@adonisjs/drive/services/main'
import axios from 'axios';
import logger from '@adonisjs/core/services/logger'
import transmit from '@adonisjs/transmit/services/main'
import { inject } from "@adonisjs/core";
import { ServiceStatus } from "../../types/services.js";

@inject()
export class DockerService {
  private docker: Docker;
  public static KIWIX_SERVICE_NAME = 'nomad_kiwix_serve';
  public static OPENSTREETMAP_SERVICE_NAME = 'nomad_openstreetmap';
  public static OLLAMA_SERVICE_NAME = 'nomad_ollama';
  public static OPEN_WEBUI_SERVICE_NAME = 'nomad_open_webui';

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async affectContainer(serviceName: string, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; message: string }> {
    try {
      const service = await Service.query().where('service_name', serviceName).first();
      if (!service || !service.installed) {
        return {
          success: false,
          message: `Service ${serviceName} not found or not installed`,
        };
      }

      const containers = await this.docker.listContainers({ all: true });
      const container = containers.find(c => c.Names.includes(`/${serviceName}`));
      if (!container) {
        return {
          success: false,
          message: `Container for service ${serviceName} not found`,
        };
      }

      const dockerContainer = this.docker.getContainer(container.Id);
      if (action === 'stop') {
        await dockerContainer.stop();
        return {
          success: true,
          message: `Service ${serviceName} stopped successfully`,
        };
      }

      if (action === 'restart') {
        await dockerContainer.restart();
        return {
          success: true,
          message: `Service ${serviceName} restarted successfully`,
        };
      }

      if (action === 'start') {
        if (container.State === 'running') {
          return {
            success: true,
            message: `Service ${serviceName} is already running`,
          };
        }
        await dockerContainer.start();
      }

      return {
        success: false,
        message: `Invalid action: ${action}. Use 'start', 'stop', or 'restart'.`,
      }
    } catch (error) {
      console.error(`Error starting service ${serviceName}: ${error.message}`);
      return {
        success: false,
        message: `Failed to start service ${serviceName}: ${error.message}`,
      };
    }
  }

  async getServicesStatus(): Promise<{
    service_name: string;
    status: ServiceStatus;
  }[]> {
    try {
      const services = await Service.query().where('installed', true);
      if (!services || services.length === 0) {
        return [];
      }

      const containers = await this.docker.listContainers({ all: true });
      const containerMap = new Map<string, Docker.ContainerInfo>();
      containers.forEach(container => {
        const name = container.Names[0].replace('/', '');
        if (name.startsWith('nomad_')) {
          containerMap.set(name, container);
        }
      });

      const getStatus = (state: string): ServiceStatus => {
        switch (state) {
          case 'running':
            return 'running';
          case 'exited':
          case 'created':
          case 'paused':
            return 'stopped';
          default:
            return 'unknown';
        }
      };


      return Array.from(containerMap.entries()).map(([name, container]) => ({
        service_name: name,
        status: getStatus(container.State),
      }));
    } catch (error) {
      console.error(`Error fetching services status: ${error.message}`);
      return [];
    }
  }

  async createContainerPreflight(serviceName: string): Promise<{ success: boolean; message: string }> {
    const service = await Service.query().where('service_name', serviceName).first();
    if (!service) {
      return {
        success: false,
        message: `Service ${serviceName} not found`,
      };
    }

    if (service.installed) {
      return {
        success: false,
        message: `Service ${serviceName} is already installed`,
      };
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

    const containerConfig = this._parseContainerConfig(service.container_config);
    this._createContainer(service, containerConfig);  // Don't await this method - we will use server-sent events to notify the client of progress

    return {
      success: true,
      message: `Service ${serviceName} installation initiated successfully. You can receive updates via server-sent events.`,
    }
  }

  /**
   * Handles the long-running process of creating a Docker container for a service.
   * NOTE: This method should not be called directly. Instead, use `createContainerPreflight` to check prerequisites first
   * and return an HTTP response to the client, if needed. This method will then transmit server-sent events to the client
   * to notify them of the progress.
   * @param serviceName 
   * @returns 
   */
  async _createContainer(service: Service & { dependencies?: Service[] }, containerConfig: any): Promise<void> {
    try {
      this._broadcastAndLog(service.service_name, 'initializing', '');

      let dependencies = [];
      if (service.depends_on) {
        const dependency = await Service.query().where('service_name', service.depends_on).first();
        if (dependency) {
          dependencies.push(dependency);
        }
      }

      console.log('dependencies for service', service.service_name)
      console.log(dependencies)

      // First, check if the service has any dependencies that need to be installed first
      if (dependencies && dependencies.length > 0) {
        this._broadcastAndLog(service.service_name, 'checking-dependencies', `Checking dependencies for service ${service.service_name}...`);
        for (const dependency of dependencies) {
          if (!dependency.installed) {
            this._broadcastAndLog(service.service_name, 'dependency-not-installed', `Dependency service ${dependency.service_name} is not installed. Installing it first...`);
            await this._createContainer(dependency, this._parseContainerConfig(dependency.container_config));
          } else {
            this._broadcastAndLog(service.service_name, 'dependency-installed', `Dependency service ${dependency.service_name} is already installed.`);
          }
        }
      }

      // Start pulling the Docker image and wait for it to complete
      const pullStream = await this.docker.pull(service.container_image);
      this._broadcastAndLog(service.service_name, 'pulling', `Pulling Docker image ${service.container_image}...`);
      await new Promise(res => this.docker.modem.followProgress(pullStream, res));
      this._broadcastAndLog(service.service_name, 'pulled', `Docker image ${service.container_image} pulled successfully.`);

      this._broadcastAndLog(service.service_name, 'creating', `Creating Docker container for service ${service.service_name}...`);
      const container = await this.docker.createContainer({
        Image: service.container_image,
        name: service.service_name,
        HostConfig: containerConfig?.HostConfig || undefined,
        WorkingDir: containerConfig?.WorkingDir || undefined,
        ExposedPorts: containerConfig?.ExposedPorts || undefined,
        ...(service.container_command ? { Cmd: service.container_command.split(' ') } : {}),
        ...(service.service_name === 'open-webui' ? { Env: ['WEBUI_AUTH=False', 'PORT=3000', 'OLLAMA_BASE_URL=http://127.0.0.1:11434'] } : {}), // Special case for Open WebUI
      });

      this._broadcastAndLog(service.service_name, 'created', `Docker container for service ${service.service_name} created successfully.`);

      if (service.service_name === DockerService.KIWIX_SERVICE_NAME) {
        await this._runPreinstallActions__KiwixServe();
        this._broadcastAndLog(service.service_name, 'preinstall-complete', `Pre-install actions for Kiwix Serve completed successfully.`);
      } else if (service.service_name === DockerService.OPENSTREETMAP_SERVICE_NAME) {
        await this._runPreinstallActions__OpenStreetMap(containerConfig);
        this._broadcastAndLog(service.service_name, 'preinstall-complete', `Pre-install actions for OpenStreetMap completed successfully.`);
      }

      this._broadcastAndLog(service.service_name, 'starting', `Starting Docker container for service ${service.service_name}...`);
      await container.start();
      this._broadcastAndLog(service.service_name, 'started', `Docker container for service ${service.service_name} started successfully.`);

      this._broadcastAndLog(service.service_name, 'finalizing', `Finalizing installation of service ${service.service_name}...`);

      service.installed = true;
      await service.save();

      this._broadcastAndLog(service.service_name, 'completed', `Service ${service.service_name} installation completed successfully.`);
    } catch (error) {
      this._broadcastAndLog(service.service_name, 'error', `Error installing service ${service.service_name}: ${error.message}`);
      throw new Error(`Failed to install service ${service.service_name}: ${error.message}`);
    }
  }

  async _checkIfServiceContainerExists(serviceName: string): Promise<boolean> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.some(container => container.Names.includes(`/${serviceName}`));
    } catch (error) {
      console.error(`Error checking if service container exists: ${error.message}`);
      return false;
    }
  }

  async _removeServiceContainer(serviceName: string): Promise<{ success: boolean; message: string }> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const container = containers.find(c => c.Names.includes(`/${serviceName}`));
      if (!container) {
        return { success: false, message: `Container for service ${serviceName} not found` };
      }

      const dockerContainer = this.docker.getContainer(container.Id);
      await dockerContainer.stop();
      await dockerContainer.remove();

      return { success: true, message: `Service ${serviceName} container removed successfully` };
    } catch (error) {
      console.error(`Error removing service container: ${error.message}`);
      return { success: false, message: `Failed to remove service ${serviceName} container: ${error.message}` };
    }
  }

  private async _runPreinstallActions__KiwixServe(): Promise<void> {
    /**
     * At least one .zim file must be available before we can start the kiwix container.
     * We'll download the lightweight mini Wikipedia Top 100 zim file for this purpose.
     **/
    const WIKIPEDIA_ZIM_URL = "https://download.kiwix.org/zim/wikipedia/wikipedia_en_100_mini_2025-06.zim"
    const PATH = '/zim/wikipedia_en_100_mini_2025-06.zim';

    this._broadcastAndLog('kiwix-serve', 'preinstall', `Running pre-install actions for Kiwix Serve...`);
    this._broadcastAndLog('kiwix-serve', 'preinstall', `Downloading Wikipedia ZIM file from ${WIKIPEDIA_ZIM_URL}. This may take some time...`);
    const response = await axios.get(WIKIPEDIA_ZIM_URL, {
      responseType: 'stream',
    });

    const stream = response.data;
    stream.on('error', (error: Error) => {
      logger.error(`Error downloading Wikipedia ZIM file: ${error.message}`);
      throw error;
    });

    const disk = drive.use('fs');
    await disk.putStream(PATH, stream);

    this._broadcastAndLog('kiwix-serve', 'preinstall', `Downloaded Wikipedia ZIM file to ${PATH}`);
  }

  /**
   * Largely follows the install instructions here: https://github.com/Overv/openstreetmap-tile-server/blob/master/README.md
   */
  private async _runPreinstallActions__OpenStreetMap(containerConfig: any): Promise<void> {
    const FILE_NAME = 'us-pacific-latest.osm.pbf';
    const OSM_PBF_URL = `https://download.geofabrik.de/north-america/${FILE_NAME}`; // Download a small subregion for initial import
    const PATH = `/osm/${FILE_NAME}`;

    this._broadcastAndLog('openstreetmap', 'preinstall', `Running pre-install actions for OpenStreetMap Tile Server...`);
    this._broadcastAndLog('openstreetmap', 'preinstall', `Downloading OpenStreetMap PBF file from ${OSM_PBF_URL}. This may take some time...`);
    const response = await axios.get(OSM_PBF_URL, {
      responseType: 'stream',
    });

    const stream = response.data;
    stream.on('error', (error: Error) => {
      logger.error(`Error downloading OpenStreetMap PBF file: ${error.message}`);
      throw error;
    });

    const disk = drive.use('fs');
    await disk.putStream(PATH, stream);
    this._broadcastAndLog('openstreetmap', 'preinstall', `Downloaded OpenStreetMap PBF file to ${PATH}`);

    // Do initial import of OSM data into the tile server DB
    // We'll use the same containerConfig as the actual container, just with the command set to "import"
    this._broadcastAndLog('openstreetmap', 'importing', `Processing initial import of OSM data. This may take some time...`);
    const data = await new Promise((resolve, reject) => {
      this.docker.run(containerConfig.Image, ['import'], process.stdout, containerConfig?.HostConfig || {}, {},
        // @ts-ignore  
        (err: any, data: any, container: any) => {
          if (err) {
            logger.error(`Error running initial import for OpenStreetMap Tile Server: ${err.message}`);
            return reject(err);
          }
          resolve(data);
        });
    });

    const [output, container] = data as [any, any];
    if (output?.StatusCode === 0) {
      this._broadcastAndLog('openstreetmap', 'imported', `OpenStreetMap data imported successfully.`);
      await container.remove();
    } else {
      const errorMessage = `Failed to import OpenStreetMap data. Status code: ${output?.StatusCode}. Output: ${output?.Output || 'No output'}`;
      this._broadcastAndLog('openstreetmap', 'error', errorMessage);
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  private _broadcastAndLog(service: string, status: string, message: string) {
    transmit.broadcast('service-installation', {
      service_name: service,
      timestamp: new Date().toISOString(),
      status,
      message,
    });
    logger.info(`[DockerService] [${service}] ${status}: ${message}`);
  }

  private _parseContainerConfig(containerConfig: any): any {
    if (!containerConfig) {
      return {};
    }

    try {
      // Handle the case where containerConfig is returned as an object by DB instead of a string
      let toParse = containerConfig;
      if (typeof containerConfig === 'object') {
        toParse = JSON.stringify(containerConfig);
      }

      return JSON.parse(toParse);
    } catch (error) {
      logger.error(`Failed to parse container configuration: ${error.message}`);
      throw new Error(`Invalid container configuration: ${error.message}`);
    }
  }
}