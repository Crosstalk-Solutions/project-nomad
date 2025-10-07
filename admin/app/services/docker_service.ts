import Service from "#models/service";
import Docker from "dockerode";
import drive from '@adonisjs/drive/services/main'
import axios from 'axios';
import logger from '@adonisjs/core/services/logger'
import { inject } from "@adonisjs/core";
import { ServiceStatus } from "../../types/services.js";
import transmit from "@adonisjs/transmit/services/main";
import { Readable } from "stream";
import { chmodRecursive, chownRecursive } from "../../util/files.js";
import fs from 'fs'

@inject()
export class DockerService {
  private docker: Docker;
  public static KIWIX_SERVICE_NAME = 'nomad_kiwix_serve';
  public static OPENSTREETMAP_SERVICE_NAME = 'nomad_openstreetmap';
  public static OPENSTREETMAP_IMPORT_SERVICE_NAME = 'nomad_openstreetmap_import';
  public static OLLAMA_SERVICE_NAME = 'nomad_ollama';
  public static OPEN_WEBUI_SERVICE_NAME = 'nomad_open_webui';
  public static CYBERCHEF_SERVICE_NAME = 'nomad_cyberchef';
  public static NOMAD_STORAGE_ABS_PATH = '/opt/project-nomad/storage';

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
      logger.error(`Error starting service ${serviceName}: ${error.message}`);
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
      this._broadcast(service.service_name, 'initializing', '');

      let dependencies = [];
      if (service.depends_on) {
        const dependency = await Service.query().where('service_name', service.depends_on).first();
        if (dependency) {
          dependencies.push(dependency);
        }
      }

      // First, check if the service has any dependencies that need to be installed first
      if (dependencies && dependencies.length > 0) {
        this._broadcast(service.service_name, 'checking-dependencies', `Checking dependencies for service ${service.service_name}...`);
        for (const dependency of dependencies) {
          if (!dependency.installed) {
            this._broadcast(service.service_name, 'dependency-not-installed', `Dependency service ${dependency.service_name} is not installed. Installing it first...`);
            await this._createContainer(dependency, this._parseContainerConfig(dependency.container_config));
          } else {
            this._broadcast(service.service_name, 'dependency-installed', `Dependency service ${dependency.service_name} is already installed.`);
          }
        }
      }

      // Start pulling the Docker image and wait for it to complete
      const pullStream = await this.docker.pull(service.container_image);
      this._broadcast(service.service_name, 'pulling', `Pulling Docker image ${service.container_image}...`);
      await new Promise(res => this.docker.modem.followProgress(pullStream, res));

      if (service.service_name === DockerService.KIWIX_SERVICE_NAME) {
        await this._runPreinstallActions__KiwixServe();
        this._broadcast(service.service_name, 'preinstall-complete', `Pre-install actions for Kiwix Serve completed successfully.`);
      } else if (service.service_name === DockerService.OPENSTREETMAP_SERVICE_NAME) {
        await this._runPreinstallActions__OpenStreetMap(service.container_image, containerConfig);
        this._broadcast(service.service_name, 'preinstall-complete', `Pre-install actions for OpenStreetMap completed successfully.`);
      }

      this._broadcast(service.service_name, 'creating', `Creating Docker container for service ${service.service_name}...`);
      const container = await this.docker.createContainer({
        Image: service.container_image,
        name: service.service_name,
        ...(containerConfig?.User && { User: containerConfig.User }),
        ...(containerConfig?.HostConfig && { HostConfig: containerConfig.HostConfig }),
        ...(containerConfig?.WorkingDir && { WorkingDir: containerConfig.WorkingDir }),
        ...(containerConfig?.ExposedPorts && { ExposedPorts: containerConfig.ExposedPorts }),
        ...(service.container_command ? { Cmd: service.container_command.split(' ') } : {}),
        ...(service.service_name === 'open-webui' ? { Env: ['WEBUI_AUTH=False', 'PORT=3000', 'OLLAMA_BASE_URL=http://127.0.0.1:11434'] } : {}), // Special case for Open WebUI
      });

      this._broadcast(service.service_name, 'starting', `Starting Docker container for service ${service.service_name}...`);
      await container.start();

      this._broadcast(service.service_name, 'finalizing', `Finalizing installation of service ${service.service_name}...`);
      service.installed = true;
      await service.save();

      this._broadcast(service.service_name, 'completed', `Service ${service.service_name} installation completed successfully.`);
    } catch (error) {
      this._broadcast(service.service_name, 'error', `Error installing service ${service.service_name}: ${error.message}`);
      throw new Error(`Failed to install service ${service.service_name}: ${error.message}`);
    }
  }

  async _checkIfServiceContainerExists(serviceName: string): Promise<boolean> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.some(container => container.Names.includes(`/${serviceName}`));
    } catch (error) {
      logger.error(`Error checking if service container exists: ${error.message}`);
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
      logger.error(`Error removing service container: ${error.message}`);
      return { success: false, message: `Failed to remove service ${serviceName} container: ${error.message}` };
    }
  }

  private async _runPreinstallActions__KiwixServe(): Promise<void> {
    /**
     * At least one .zim file must be available before we can start the kiwix container.
     * We'll download the lightweight mini Wikipedia Top 100 zim file for this purpose.
     **/
    const WIKIPEDIA_ZIM_URL = "https://github.com/Crosstalk-Solutions/project-nomad/blob/master/install/wikipedia_en_100_mini_2025-06.zim"
    const PATH = '/zim/wikipedia_en_100_mini_2025-06.zim';

    this._broadcast(DockerService.KIWIX_SERVICE_NAME, 'preinstall', `Running pre-install actions for Kiwix Serve...`);
    this._broadcast(DockerService.KIWIX_SERVICE_NAME, 'preinstall', `Downloading Wikipedia ZIM file from ${WIKIPEDIA_ZIM_URL}. This may take some time...`);
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

    this._broadcast(DockerService.KIWIX_SERVICE_NAME, 'preinstall', `Downloaded Wikipedia ZIM file to ${PATH}`);
  }

  /**
   * Largely follows the install instructions here: https://github.com/Overv/openstreetmap-tile-server/blob/master/README.md
   */
  private async _runPreinstallActions__OpenStreetMap(image: string, containerConfig: any): Promise<void> {
    const OSM_PBF_URL = 'https://download.geofabrik.de/north-america/us-pacific-latest.osm.pbf'; // Download US Pacific sub-region for initial import

    const IMPORT_FILE = 'region.osm.pbf';
    const IMPORT_FILE_PATH = `${DockerService.NOMAD_STORAGE_ABS_PATH}/osm/${IMPORT_FILE}`; // We only want to use the full abs path here because we need to pass it to the Docker container config
    const IMPORT_BIND = `${IMPORT_FILE_PATH}:/data/${IMPORT_FILE}:rw`;

    const LOG_PATH = `/logs/${DockerService.OPENSTREETMAP_IMPORT_SERVICE_NAME}.log`;
    const disk = drive.use('fs');

    this._broadcast(DockerService.OPENSTREETMAP_IMPORT_SERVICE_NAME, 'preinstall', `Running pre-install actions for OpenStreetMap Tile Server...`);

    // Ensure osm directory has proper perms for OSM container to write cached files to
    this._broadcast(DockerService.OPENSTREETMAP_IMPORT_SERVICE_NAME, 'preinstall', 'Ensuring OSM directory permissions are set correctly...');

    // Ensure directories exist
    await fs.promises.mkdir(`/osm/db`, { recursive: true });
    await fs.promises.mkdir(`/osm/tiles`, { recursive: true });

    // Must be able to read directories and read/write files inside
    await chmodRecursive(`/osm/db`, 0o755, 0o755);
    await chownRecursive(`/osm/db`, 1000, 1000);

    // Must be able to read directories and read/write files inside
    await chmodRecursive(`/osm/tiles`, 0o755, 0o755);
    await chownRecursive(`/osm/tiles`, 1000, 1000);

    // If the initial import file already exists, delete it so we can ensure it is a good download
    const fileExists = await disk.exists(IMPORT_FILE_PATH);
    if (fileExists) {
      await disk.delete(IMPORT_FILE_PATH);
    }

    this._broadcast(DockerService.OPENSTREETMAP_IMPORT_SERVICE_NAME, 'preinstall', `Downloading OpenStreetMap PBF file from ${OSM_PBF_URL}. This may take some time...`);
    const response = await axios.get(OSM_PBF_URL, {
      responseType: 'stream',
    });
    await disk.putStream(`/osm/${IMPORT_FILE}`, response.data);

    // Do initial import of OSM data into the tile server DB
    // We need to add the initial osm.pbf file as another volume bind so we can import it
    const configWithImportBind = containerConfig.HostConfig || {};
    Object.assign(configWithImportBind, {
      RestartPolicy: { Name: 'no' },
      Binds: [...(containerConfig.HostConfig?.Binds || []), IMPORT_BIND],
      Memory: 4 * 1024 * 1024 * 1024, // 4GB
      MemorySwap: -1
    });

    this._broadcast(DockerService.OPENSTREETMAP_IMPORT_SERVICE_NAME, 'importing', `Processing initial import of OSM data. This may take some time...`);
    await disk.put(LOG_PATH, 'Beginning OpenStreetMap data import...\n');

    const container = await this.docker.createContainer({
      Image: image,
      name: DockerService.OPENSTREETMAP_IMPORT_SERVICE_NAME,
      Cmd: ['import'],
      HostConfig: configWithImportBind,
    });

    await container.start();

    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      timestamps: true
    })

    const readableLogStream: Readable = Readable.from(logStream);
    await disk.putStream(LOG_PATH, readableLogStream);

    const data = await container.wait();
    logger.debug(`OpenStreetMap data import result: ${JSON.stringify(data)}`);

    const statusCode = data.StatusCode;
    await container.remove();

    // Set perms again to ensure they are correct after import process
    await chmodRecursive(`/osm/db`, 0o755, 0o755);
    await chownRecursive(`/osm/db`, 1000, 1000);

    await chmodRecursive(`/osm/tiles`, 0o755, 0o755);
    await chownRecursive(`/osm/tiles`, 1000, 1000);


    if (statusCode !== 0) {
      throw new Error(`OpenStreetMap data import failed with status code ${statusCode}. Check the log file at ${LOG_PATH} for details.`);
    }
  }

  private _broadcast(service: string, status: string, message: string) {
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