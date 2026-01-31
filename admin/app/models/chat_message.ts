import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ChatSession from './chat_session.js'

export default class ChatMessage extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare session_id: number

  @column()
  declare role: 'system' | 'user' | 'assistant'

  @column()
  declare content: string

  @belongsTo(() => ChatSession, { foreignKey: 'id', localKey: 'session_id' })
  declare session: BelongsTo<typeof ChatSession>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}
