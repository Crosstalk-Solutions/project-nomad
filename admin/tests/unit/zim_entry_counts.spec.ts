import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classifyZimEntry,
  emptyZimEntryCounts,
  shouldBackfillZimEntryCensus,
  ZIM_CENSUS_BACKFILL_MAX_CHUNKS,
} from '../../app/utils/zim_entry_counts.js'

test('classifyZimEntry matches the extractor: HTML and XHTML are articles, PDFs are PDFs', () => {
  assert.equal(classifyZimEntry('text/html'), 'html')
  assert.equal(classifyZimEntry('application/xhtml+xml'), 'html')
  assert.equal(classifyZimEntry('application/pdf'), 'pdf')
  assert.equal(classifyZimEntry('image/svg+xml'), 'other')
  assert.equal(classifyZimEntry('application/javascript'), 'other')
  assert.equal(classifyZimEntry(undefined), 'other')
})

test('emptyZimEntryCounts starts every kind at zero', () => {
  assert.deepEqual(emptyZimEntryCounts(), { html: 0, pdf: 0, other: 0 })
})

test('shouldBackfillZimEntryCensus targets small, indexed, un-censused ZIM rows only', () => {
  const base = { state: 'indexed', chunks_embedded: 1, html_entries: null, pdf_entries: null }
  assert.equal(
    shouldBackfillZimEntryCensus('/app/storage/zim/fas-military-medicine.zim', base),
    true
  )
  // already censused
  assert.equal(
    shouldBackfillZimEntryCensus('/app/storage/zim/a.zim', {
      ...base,
      html_entries: 1,
      pdf_entries: 25,
    }),
    false
  )
  // not a ZIM
  assert.equal(shouldBackfillZimEntryCensus('/storage/kb_uploads/book.pdf', base), false)
  // not indexed yet: the first batch takes the census itself
  assert.equal(
    shouldBackfillZimEntryCensus('/app/storage/zim/a.zim', { ...base, state: 'pending_decision' }),
    false
  )
  // large result: has real HTML content, not worth a scan-time pass
  assert.equal(
    shouldBackfillZimEntryCensus('/app/storage/zim/a.zim', {
      ...base,
      chunks_embedded: ZIM_CENSUS_BACKFILL_MAX_CHUNKS,
    }),
    false
  )
})
