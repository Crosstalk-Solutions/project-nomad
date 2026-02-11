import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { ManifestType } from '../../types/collections.js'

export default class CollectionManifest extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare type: ManifestType

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
