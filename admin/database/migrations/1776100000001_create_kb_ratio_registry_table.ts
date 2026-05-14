import { BaseSchema } from '@adonisjs/lucid/schema'
import { DateTime } from 'luxon'

const SEED_ROWS: Array<{ pattern: string; chunks_per_mb: number; notes: string }> = [
  // Dense technical reference — every paragraph carries content
  { pattern: 'devdocs_', chunks_per_mb: 1100, notes: 'Heuristic seed: dense API references' },
  // Encyclopedia prose — Simple English & general Wikipedia variants
  {
    pattern: 'wikipedia_en_simple_',
    chunks_per_mb: 270,
    notes: 'Heuristic seed: Simple English Wikipedia',
  },
  {
    pattern: 'wikipedia_en_',
    chunks_per_mb: 270,
    notes: 'Heuristic seed: general Wikipedia variants',
  },
  // Sparse text, image-heavy
  { pattern: 'ifixit_', chunks_per_mb: 50, notes: 'Heuristic seed: image-heavy repair guides' },
  // Q&A pages — moderate density, mostly short answers
  {
    pattern: 'cooking.stackexchange.com_',
    chunks_per_mb: 200,
    notes: 'Heuristic seed: Stack Exchange Q&A',
  },
  // Video-only ZIMs produce zero text chunks. Listing these explicitly keeps
  // the cost estimator from spinning up "indexing in progress" UI for content
  // that has no embeddable text whatsoever.
  { pattern: 'lrnselfreliance_', chunks_per_mb: 0, notes: 'Heuristic seed: video-only ZIM' },
  { pattern: 'ted_', chunks_per_mb: 0, notes: 'Heuristic seed: video-only ZIM' },
  { pattern: 'freedom-of-religion_', chunks_per_mb: 0, notes: 'Heuristic seed: video-only ZIM' },
  // Empty-pattern fallback — every filename startsWith('') is true. The lookup
  // picks the longest matching pattern, so this only fires for ZIMs that match
  // none of the above (medium prose density).
  { pattern: '', chunks_per_mb: 100, notes: 'Heuristic fallback' },
]

export default class extends BaseSchema {
  protected tableName = 'kb_ratio_registry'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('pattern', 255).notNullable().unique()
      table.decimal('chunks_per_mb', 10, 2).notNullable()
      // 0 = heuristic seed, >0 = number of observed ZIMs that have updated this entry.
      // Phase 4 self-calibration increments this on each successful ingestion.
      table.integer('sample_count').notNullable().defaultTo(0)
      table.text('notes').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    const now = DateTime.utc().toSQL({ includeOffset: false }) as string
    const rows = SEED_ROWS.map((row) => ({ ...row, created_at: now, updated_at: now }))
    this.defer(async (db) => {
      await db.table(this.tableName).multiInsert(rows)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
