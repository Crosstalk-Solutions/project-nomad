import Service from '#models/service'

export type ServiceStatus = 'unknown' | 'running' | 'stopped'
export type ServiceSlim = Pick<
  Service,
  | 'id'
  | 'service_name'
  | 'installed'
  | 'installation_status'
  | 'ui_location'
  | 'friendly_name'
  | 'description'
  | 'icon'
> & { status?: ServiceStatus }
