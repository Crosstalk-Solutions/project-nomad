import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import CuratedCollectionResource from './curated_collection_resource.js'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import type { CuratedCollectionType } from '../../types/curated_collections.js'

export default class CuratedCollection extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare slug: string

  @column()
  declare type: CuratedCollectionType

  @column()
  declare name: string

  @column()
  declare description: string

  @column()
  declare icon: string

  @column()
  declare language: string

  @hasMany(() => CuratedCollectionResource, {
    foreignKey: 'curated_collection_slug',
    localKey: 'slug',
  })
  declare resources: HasMany<typeof CuratedCollectionResource>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}
