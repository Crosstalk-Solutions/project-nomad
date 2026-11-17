import { BaseSchema } from '@adonisjs/lucid/schema'
import { isWikipediaSelectorFile } from '../../app/utils/zim_filename.js'

// Selector options at the time of the #1482 fix, used when the install never cached the manifest
const FALLBACK_OPTION_URLS = [
  'wikipedia_en_top_mini_2026-06.zim',
  'wikipedia_en_top_nopic_2026-06.zim',
  'wikipedia_en_all_mini_2026-06.zim',
  'wikipedia_en_all_nopic_2026-06.zim',
  'wikipedia_en_all_maxi_2026-02.zim',
]

export default class extends BaseSchema {
  protected tableName = 'wikipedia_selections'

  async up() {
    // Repair installs hit by #1482. Another wikipedia_en_* corpus (e.g. the Medicine tier ZIM) took
    // over the selection, so choosing "None" would delete it and the boot reconcile skips its
    // InstalledResource row. Resetting the row (file left on disk) lets the next reconcile restore it.
    this.defer(async (db) => {
      const manifest = await db.from('collection_manifests').where('type', 'wikipedia').first()
      const spec = manifest?.spec_data
        ? typeof manifest.spec_data === 'string'
          ? JSON.parse(manifest.spec_data)
          : manifest.spec_data
        : null
      const optionUrls: Array<string | null> = spec?.options?.length
        ? spec.options.map((o: { url: string | null }) => o.url)
        : FALLBACK_OPTION_URLS

      const rows = await db.from(this.tableName).select('id', 'filename', 'url')
      for (const row of rows) {
        const name = row.filename ?? row.url?.split('/').pop()
        if (!name || isWikipediaSelectorFile(name, optionUrls)) continue
        await db
          .from(this.tableName)
          .where('id', row.id)
          .update({ option_id: 'none', status: 'none', filename: null, url: null })
      }
    })
  }

  async down() {
    // One-way data repair: the cleared value pointed at a file that was never the Wikipedia selection.
  }
}
