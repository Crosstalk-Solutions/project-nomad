import Service from "#models/service";


export type ServiceStatus = 'unknown' | 'running' | 'stopped';
export type ServiceSlim = Pick<Service, 'id' | 'service_name' | 'installed' | 'ui_location' | 'friendly_name' | 'description'> & { status?: ServiceStatus };