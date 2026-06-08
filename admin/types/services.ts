import Service from '#models/service'

export type ServiceSlim = Pick<
  Service,
  | 'id'
  | 'service_name'
  | 'installed'
  | 'installation_status'
  | 'ui_location'
  | 'custom_url'
  | 'friendly_name'
  | 'description'
  | 'icon'
  | 'powered_by'
  | 'display_order'
  | 'container_image'
  | 'available_update_version'
  | 'auto_update_enabled'
  | 'is_custom'
  | 'is_user_modified'
  | 'category'
> & { status?: string }
