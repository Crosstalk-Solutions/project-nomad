import Service from "#models/service"
import { inject } from "@adonisjs/core";
import { DockerService } from "#services/docker_service";
import { ServiceStatus } from "../../types/services.js";

@inject()
export class SystemService {
  constructor(
    private dockerService: DockerService
  ) {}
  async getServices({
    installedOnly = true,
  }:{
    installedOnly?: boolean
  }): Promise<{ id: number; service_name: string; installed: boolean, status: ServiceStatus }[]> {
    const query =  Service.query().orderBy('service_name', 'asc').select('id', 'service_name', 'installed', 'ui_location').where('is_dependency_service', false)
    if (installedOnly) {
      query.where('installed', true);
    }

    const services = await query;
    if (!services || services.length === 0) {
      return [];
    }

    const statuses = await this.dockerService.getServicesStatus();

    const toReturn = [];

    for (const service of services) {
      const status = statuses.find(s => s.service_name === service.service_name);
      toReturn.push({
        id: service.id,
        service_name: service.service_name,
        installed: service.installed,
        status: status ? status.status : 'unknown',
        ui_location: service.ui_location || ''
      });
    }

    return toReturn;

  }
}