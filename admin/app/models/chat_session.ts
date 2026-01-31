import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import ChatMessage from './chat_message.js'

export default class ChatSession extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare model: string | null

  @hasMany(() => ChatMessage, {
    foreignKey: 'session_id',
    localKey: 'id',
  })
  declare messages: HasMany<typeof ChatMessage>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}