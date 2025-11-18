import Service from "#models/service"
import { inject } from "@adonisjs/core";
import { DockerService } from "#services/docker_service";
import { ServiceSlim } from "../../types/services.js";
import logger from "@adonisjs/core/services/logger";
import si from 'systeminformation';
import { SystemInformationResponse } from "../../types/system.js";

@inject()
export class SystemService {
  constructor(
    private dockerService: DockerService
  ) { }
  async getServices({
    installedOnly = true,
  }: {
    installedOnly?: boolean
  }): Promise<ServiceSlim[]> {
    const query = Service.query().orderBy('friendly_name', 'asc').select('id', 'service_name', 'installed', 'ui_location', 'friendly_name', 'description').where('is_dependency_service', false)
    if (installedOnly) {
      query.where('installed', true);
    }

    const services = await query;
    if (!services || services.length === 0) {
      return [];
    }

    const statuses = await this.dockerService.getServicesStatus();

    const toReturn: ServiceSlim[] = [];

    for (const service of services) {
      const status = statuses.find(s => s.service_name === service.service_name);
      toReturn.push({
        id: service.id,
        service_name: service.service_name,
        friendly_name: service.friendly_name,
        description: service.description,
        installed: service.installed,
        status: status ? status.status : 'unknown',
        ui_location: service.ui_location || ''
      });
    }

    return toReturn;

  }

  async getSystemInfo(): Promise<SystemInformationResponse | undefined> {
    try {
      const [cpu, mem, os, disk] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.diskLayout()
      ]);;

      return {
        cpu,
        mem,
        os,
        disk
      };
    } catch (error) {
      logger.error('Error getting system info:', error);
      return undefined;
    }
  }
}