import Service from '#models/service'

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
> & { status?: string }
