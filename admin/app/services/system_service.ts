import Service from "#models/service"

export class SystemService {
  async getServices(): Promise<{ id: number; service_name: string; installed: boolean }[]> {
    return await Service.query().orderBy('service_name', 'asc').select('id', 'service_name', 'installed', 'ui_location');
  }
}