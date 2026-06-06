import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import {
  findChunksPerMb,
  estimateChunkCount,
  estimateBatch,
  type BatchEstimate,
  type BatchEstimateInput,
} from '../utils/kb_ratio_lookup.js'

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

  /**
   * Estimate total chunks for a file of the given size on disk.
   *
   * `ignoreCatchAll` excludes the empty-pattern fallback, returning `null` for
   * filenames that only the catch-all would match. The partial_stall warning
   * uses this so it never flags ZIMs the registry can't specifically
   * characterize (e.g. PDF/link-out-heavy archives whose byte size wildly
   * over-predicts embeddable chunks). See #913.
   */
  static async estimateChunks(
    filename: string,
    fileSizeBytes: number,
    opts: { ignoreCatchAll?: boolean } = {}
  ): Promise<number | null> {
    const rows = await this.all()
    return estimateChunkCount(filename, fileSizeBytes, rows, opts)
  }

  /**
   * Aggregate an embedding-disk-cost estimate across a batch of files. Used by
   * the curated-tier-change UI to show "you're about to add ~X GB of
   * embeddings on top of the ZIM downloads" before the user commits.
   */
  static async estimateBatch(files: BatchEstimateInput[]): Promise<BatchEstimate> {
    const rows = await this.all()
    return estimateBatch(files, rows)
  }
}
