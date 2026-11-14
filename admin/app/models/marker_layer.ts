import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import MapMarker from '#models/map_marker'

// A named group of map pins that can be shown, hidden and exported together (#1387).
// Not to be confused with MapLibre style layers in map_service.ts.
export default class MarkerLayer extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column({
    // tinyint(1) comes back as 1/0; see MapMarker.visible.
    consume: (value: number | boolean) => Boolean(value),
  })
  declare visible: boolean

  @column()
  declare sort_order: number

  @hasMany(() => MapMarker, { foreignKey: 'layer_id' })
  declare markers: HasMany<typeof MapMarker>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}
