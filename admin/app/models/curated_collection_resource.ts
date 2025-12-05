import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import CuratedCollection from './curated_collection.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class CuratedCollectionResource extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare curated_collection_slug: string

  @belongsTo(() => CuratedCollection, {
    foreignKey: 'slug',
    localKey: 'curated_collection_slug',
  })
  declare curated_collection: BelongsTo<typeof CuratedCollection>

  @column()
  declare title: string

  @column()
  declare url: string

  @column()
  declare description: string

  @column()
  declare size_mb: number

  @column()
  declare downloaded: boolean

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}
