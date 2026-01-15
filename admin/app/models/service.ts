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

  @column()
  declare metadata: string | null

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
