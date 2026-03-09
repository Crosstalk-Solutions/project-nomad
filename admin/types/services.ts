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
  | 'powered_by'
  | 'display_order'
  | 'container_image'
  | 'available_update_version'
> & { status?: string }
