import Service from "#models/service"

export class SystemService {
  async getServices({
    installedOnly = true,
  }:{
    installedOnly?: boolean
  }): Promise<{ id: number; service_name: string; installed: boolean }[]> {
    const query =  Service.query().orderBy('service_name', 'asc').select('id', 'service_name', 'installed', 'ui_location').where('is_dependency_service', false)
    if (installedOnly) {
      query.where('installed', true);
    }
    return await query;
  }
}