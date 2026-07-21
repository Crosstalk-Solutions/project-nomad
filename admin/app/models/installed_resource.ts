import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class InstalledResource extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare resource_id: string

  @column()
  declare resource_type: 'zim' | 'map' | 'dataset'

  @column()
  declare collection_ref: string | null

  @column()
  declare version: string

  @column()
  declare url: string

  @column()
  declare file_path: string

  @column()
  declare file_size_bytes: number | null

  @column.dateTime()
  declare installed_at: DateTime

  // ── Content auto-update state (global opt-in; gated by `contentAutoUpdate.enabled`) ──

  /** Newest catalog version (YYYY-MM) detected, or null when already current. */
  @column()
  declare available_update_version: string | null

  /** Size (bytes) of the available update, captured from the catalog. */
  @column()
  declare available_update_size_bytes: number | null

  /** Cool-off anchor: when the current available update was first detected. */
  @column.dateTime()
  declare available_update_first_seen_at: DateTime | null

  /** Per-resource failure backoff so one flapping download self-disables. */
  @column()
  declare auto_update_consecutive_failures: number

  @column()
  declare auto_update_disabled_reason: string | null
}
