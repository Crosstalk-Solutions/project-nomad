import Service from "#models/service";
import Docker from "dockerode";
import drive from '@adonisjs/drive/services/main'
import axios from 'axios';
import logger from '@adonisjs/core/services/logger'
import transmit from '@adonisjs/transmit/services/main'
import { inject } from "@adonisjs/core";

@inject()
export class DockerService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async createContainerPreflight(serviceName: string): Promise<{ success: boolean; message: string }> {
    const service = await Service.findBy('service_name', serviceName);
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
    if (await this._checkIfServiceContainerExists(serviceName)) {
      const removeResult = await this._removeServiceContainer(serviceName);
      if (!removeResult.success) {
        return {
          success: false,
          message: `Failed to remove existing container for service ${serviceName}: ${removeResult.message}`,
        };
      }
    }

    // Attempt to parse any special container configuration
    let containerConfig;
    if (service.container_config) {
      try {
        containerConfig = JSON.parse(JSON.stringify(service.container_config));
      } catch (error) {
        return {
          success: false,
          message: `Failed to parse container configuration for service ${service.service_name}: ${error.message}`,
        };
      }
    }

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
  async _createContainer(service: Service, containerConfig: any): Promise<void> {

    function sendBroadcastAndLog(status: string, message: string) {
      transmit.broadcast('service-installation', {
        service_name: service.service_name,
        timestamp: new Date().toISOString(),
        status,
        message,
      });
      logger.info(`[DockerService] [${service.service_name}] ${status}: ${message}`);
    }

    sendBroadcastAndLog('initializing', '');

    // Start pulling the Docker image and wait for it to complete
    const pullStream = await this.docker.pull(service.container_image);
    sendBroadcastAndLog('pulling', `Pulling Docker image ${service.container_image}...`);

    await new Promise(res => this.docker.modem.followProgress(pullStream, res));

    sendBroadcastAndLog('pulled', `Docker image ${service.container_image} pulled successfully.`);
    sendBroadcastAndLog('creating', `Creating Docker container for service ${service.service_name}...`);

    const container = await this.docker.createContainer({
      Image: service.container_image,
      Cmd: service.container_command.split(' '),
      name: service.service_name,
      HostConfig: containerConfig?.HostConfig || undefined,
      WorkingDir: containerConfig?.WorkingDir || undefined,
      ExposedPorts: containerConfig?.ExposedPorts || undefined,
    });

    sendBroadcastAndLog('created', `Docker container for service ${service.service_name} created successfully.`);

    if (service.service_name === 'kiwix-serve') {
      sendBroadcastAndLog('preinstall', `Running pre-install actions for Kiwix Serve...`);
      await this._runPreinstallActions__KiwixServe();
      sendBroadcastAndLog('preinstall-complete', `Pre-install actions for Kiwix Serve completed successfully.`);
    }

    sendBroadcastAndLog('starting', `Starting Docker container for service ${service.service_name}...`);
    await container.start();
    sendBroadcastAndLog('started', `Docker container for service ${service.service_name} started successfully.`);

    sendBroadcastAndLog('finalizing', `Finalizing installation of service ${service.service_name}...`);

    service.installed = true;
    await service.save();

    sendBroadcastAndLog('completed', `Service ${service.service_name} installation completed successfully.`);
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

  async _runPreinstallActions__KiwixServe(): Promise<void> {
    /**
     * At least one .zim file must be available before we can start the kiwix container.
     * We'll download the lightweight mini Wikipedia Top 100 zim file for this purpose.
     **/
    const WIKIPEDIA_ZIM_URL = "https://download.kiwix.org/zim/wikipedia/wikipedia_en_100_mini_2025-06.zim"

    const response = await axios.get(WIKIPEDIA_ZIM_URL, {
      responseType: 'stream',
    });

    const stream = response.data;
    stream.on('error', (error: Error) => {
      logger.error(`Error downloading Wikipedia ZIM file: ${error.message}`);
      throw error;
    });

    const disk = drive.use('fs');
    await disk.putStream('/zim/wikipedia_en_100_mini_2025-06.zim', stream);


    logger.info(`Downloaded Wikipedia ZIM file to /zim/wikipedia_en_100_mini_2025-06.zim`);
  }

  async simulateSSE(): Promise<void> {
    // This is just a simulation of the server-sent events for testing purposes
    for (let i = 0; i <= 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      transmit.broadcast('service-installation', {
        service_name: 'test-service',
        timestamp: new Date().toISOString(),
        status: i === 10 ? 'completed' : 'in-progress',
        message: `Test message ${i}`,
      });
    }
  }
}