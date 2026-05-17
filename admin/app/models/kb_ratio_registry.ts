import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import { findChunksPerMb, estimateChunkCount } from '../utils/kb_ratio_lookup.js'

/**
 * Self-calibrating registry of `{filename-prefix → chunks_per_mb}` ratios used
 * for disk-footprint and time-to-embed estimates surfaced in the KB panel.
 *
 * Migration seeds the registry with heuristic defaults from the RFC #883
 * appendix; Phase 4 self-calibration will update rows in place as ZIMs finish
 * ingesting and the real ratio becomes known. Lookup is longest-prefix-match
 * (see `kb_ratio_lookup.ts`) so a specific entry (`wikipedia_en_simple_`)
 * overrides a broader one (`wikipedia_en_`).
 */
export default class KbRatioRegistry extends BaseModel {
  static table = 'kb_ratio_registry'
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare pattern: string

  @column()
  declare chunks_per_mb: number

  @column()
  declare sample_count: number

  @column()
  declare notes: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  /** Look up chunks_per_mb for a filename by longest-prefix match. */
  static async lookup(filename: string): Promise<number | null> {
    const rows = await this.all()
    return findChunksPerMb(filename, rows)
  }

  /** Estimate total chunks for a file of the given size on disk. */
  static async estimateChunks(filename: string, fileSizeBytes: number): Promise<number | null> {
    const rows = await this.all()
    return estimateChunkCount(filename, fileSizeBytes, rows)
  }
}
