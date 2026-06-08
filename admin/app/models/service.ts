import { BaseModel, belongsTo, column, hasMany, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

export default class Service extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare service_name: string

  @column()
  declare container_image: string

  @column()
  declare container_command: string | null

  @column()
  declare container_config: string | null

  @column()
  declare friendly_name: string | null

  @column()
  declare description: string | null

  @column()
  declare powered_by: string | null

  @column()
  declare display_order: number | null

  @column()
  declare icon: string | null // must be a TablerIcons name to be properly rendered in the UI (e.g. "IconBrandDocker")

  @column({
    serialize(value) {
      return Boolean(value)
    },
  })
  declare installed: boolean

  @column()
  declare installation_status: 'idle' | 'installing' | 'error'

  @column()
  declare depends_on: string | null

  // For services that are dependencies for other services - not intended to be installed directly by users
  @column({
    serialize(value) {
      return Boolean(value)
    },
  })
  declare is_dependency_service: boolean

  @column()
  declare ui_location: string | null

  // User-set override for the launch ("Open") link (e.g. a reverse-proxy/local-DNS host like
  // https://jellyfin.myhomelab.net). When null, the default host + port link derived from
  // ui_location is used. Only affects user-facing links — never internal service-to-service URLs.
  @column()
  declare custom_url: string | null

  @column()
  declare metadata: string | null

  @column({
    serialize(value) {
      return Boolean(value)
    },
  })
  declare is_custom: boolean

  @column({
    serialize(value) {
      return Boolean(value)
    },
  })
  declare is_user_modified: boolean

  @column()
  declare category: string | null

  @column()
  declare source_repo: string | null

  @column()
  declare available_update_version: string | null

  @column.dateTime()
  declare update_checked_at: DateTime | null

  // Per-app opt-in for automatic updates. An app auto-updates only when both this
  // and the global `appAutoUpdate.enabled` master switch are on.
  @column({
    serialize(value) {
      return Boolean(value)
    },
  })
  declare auto_update_enabled: boolean

  // When the current `available_update_version` was first detected — the anchor for
  // the auto-update cool-off (registry tags carry no publish timestamp).
  @column.dateTime()
  declare available_update_first_seen_at: DateTime | null

  // Per-app auto-update failure backoff; at the threshold the app self-disables via
  // `auto_update_disabled_reason` without affecting other apps.
  @column()
  declare auto_update_consecutive_failures: number

  @column()
  declare auto_update_disabled_reason: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime | null

  // Define a self-referential relationship for dependencies
  @belongsTo(() => Service, {
    foreignKey: 'depends_on',
  })
  declare dependency: BelongsTo<typeof Service>

  @hasMany(() => Service, {
    foreignKey: 'depends_on',
  })
  declare dependencies: HasMany<typeof Service>
}
