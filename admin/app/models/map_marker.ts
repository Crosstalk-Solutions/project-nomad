import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class MapMarker extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare longitude: number

  @column()
  declare latitude: number

  @column()
  declare color: string

  // 'pin' for user-placed markers, 'waypoint' for route points (future)
  @column()
  declare marker_type: string

  // Groups markers into a route (future)
  @column()
  declare route_id: string | null

  // Order within a route (future)
  @column()
  declare route_order: number | null

  // Optional user notes for a location
  @column()
  declare notes: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}
