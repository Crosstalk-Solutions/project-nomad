import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { KbIngestStateValue } from '../../types/kb_ingest_state.js'

const LAST_ERROR_MAX_LEN = 1024

/**
 * Tracks the per-file decision and outcome of AI knowledge-base ingestion.
 *
 * The row exists for any embeddable file the scanner has seen and is independent
 * of `installed_resources` (which only covers curated downloads). Replaces the
 * earlier "any chunks in qdrant ⇒ embedded" binary check, which conflated
 * partially-stalled ingestions with fully-indexed files. See RFC #883.
 */
export default class KbIngestState extends BaseModel {
  static table = 'kb_ingest_state'
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare file_path: string

  @column()
  declare state: KbIngestStateValue

  @column()
  declare chunks_embedded: number

  @column()
  declare last_error: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  static async getOrCreate(filePath: string): Promise<KbIngestState> {
    return this.firstOrCreate(
      { file_path: filePath },
      { file_path: filePath, state: 'pending_decision', chunks_embedded: 0 }
    )
  }

  static async markIndexed(filePath: string, chunksEmbedded: number): Promise<void> {
    const row = await this.getOrCreate(filePath)
    row.state = 'indexed'
    row.chunks_embedded = chunksEmbedded
    row.last_error = null
    await row.save()
  }

  static async markFailed(filePath: string, errorMessage: string): Promise<void> {
    const row = await this.getOrCreate(filePath)
    row.state = 'failed'
    row.last_error = errorMessage.slice(0, LAST_ERROR_MAX_LEN)
    await row.save()
  }

  static async markBrowseOnly(filePath: string): Promise<void> {
    const row = await this.getOrCreate(filePath)
    row.state = 'browse_only'
    await row.save()
  }

  static async markStalled(filePath: string): Promise<void> {
    const row = await this.getOrCreate(filePath)
    row.state = 'stalled'
    await row.save()
  }

  static async remove(filePath: string): Promise<void> {
    await this.query().where('file_path', filePath).delete()
  }
}
