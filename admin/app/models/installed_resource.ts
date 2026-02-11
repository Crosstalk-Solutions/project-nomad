import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class InstalledResource extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare resource_id: string

  @column()
  declare resource_type: 'zim' | 'map'

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
}
