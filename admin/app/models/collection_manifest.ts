import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
export default class CollectionManifest extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  /**
   * Cache key: the bare ManifestType for English ('zim_categories'), or
   * `<type>:<language>` for another content language ('zim_categories:fr').
   * See manifestCacheKey in utils/content_languages.
   */
  @column({ isPrimary: true })
  declare type: string

  @column()
  declare spec_version: string

  @column({
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
    prepare: (value: any) => JSON.stringify(value),
  })
  declare spec_data: any

  @column.dateTime()
  declare fetched_at: DateTime
}
