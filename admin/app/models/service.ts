import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class Service extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true  })
  declare id: number

  @column()
  declare service_name: string

  @column()
  declare container_image: string

  @column()
  declare container_command: string

  @column()
  declare container_config: string | null

  @column()
  declare installed: boolean

  @column()
  declare ui_location: string

  @column()
  declare metadata: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime | null
}
