import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classifyZimEntry,
  emptyZimEntryCounts,
  parseZimCounterMetadata,
  planZimEntryCensus,
  ZIM_CENSUS_FULL_SCAN_MAX_CHUNKS,
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

test('parseZimCounterMetadata sums the writer-stored mimetype counts by kind', () => {
  // fas-military-medicine_en_2025-06.zim, verbatim
  assert.deepEqual(
    parseZimCounterMetadata(
      'application/pdf=25;image/gif=2;text/css=1;text/html=1;text/javascript=3'
    ),
    { html: 1, pdf: 25, other: 6 }
  )
  // medlineplus.gov_en_all_2025-01.zim, abridged: XHTML counts as HTML
  assert.deepEqual(
    parseZimCounterMetadata(
      'application/pdf=2851;application/xhtml+xml=10;image/jpeg=7842;text/html=14940'
    ),
    { html: 14950, pdf: 2851, other: 7842 }
  )
})

test('parseZimCounterMetadata returns null for a missing or useless value', () => {
  assert.equal(parseZimCounterMetadata(undefined), null)
  assert.equal(parseZimCounterMetadata(null), null)
  assert.equal(parseZimCounterMetadata(''), null)
  assert.equal(parseZimCounterMetadata('garbage'), null)
  assert.equal(parseZimCounterMetadata('text/html=lots'), null)
  // a bad pair is skipped, good ones still count
  assert.deepEqual(parseZimCounterMetadata('text/html=-1;application/pdf=3'), {
    html: 0,
    pdf: 3,
    other: 0,
  })
})

test('planZimEntryCensus: not a ZIM, or already censused → none', () => {
  const base = { state: 'indexed', chunks_embedded: 1, html_entries: null, pdf_entries: null }
  assert.equal(planZimEntryCensus('/storage/kb_uploads/book.pdf', base), 'none')
  assert.equal(
    planZimEntryCensus('/app/storage/zim/a.zim', { ...base, html_entries: 1, pdf_entries: 25 }),
    'none'
  )
  // a census that found nothing of either kind still counts as taken
  assert.equal(
    planZimEntryCensus('/app/storage/zim/a.zim', { ...base, html_entries: 0, pdf_entries: 0 }),
    'none'
  )
})

test('planZimEntryCensus: a small indexed ZIM is worth a full entry walk', () => {
  const base = { state: 'indexed', chunks_embedded: 1, html_entries: null, pdf_entries: null }
  assert.equal(planZimEntryCensus('/app/storage/zim/fas-military-medicine.zim', base), 'full')
  // a row straight from create() has the census columns undefined, not null
  assert.equal(
    planZimEntryCensus('/app/storage/zim/fas-military-medicine.zim', {
      state: 'indexed',
      chunks_embedded: 0,
    }),
    'full'
  )
  assert.equal(
    planZimEntryCensus('/app/storage/zim/a.zim', {
      ...base,
      chunks_embedded: ZIM_CENSUS_FULL_SCAN_MAX_CHUNKS,
    }),
    'full'
  )
})

test('planZimEntryCensus: everything else gets the instant metadata read only', () => {
  const base = { state: 'indexed', chunks_embedded: 1, html_entries: null, pdf_entries: null }
  // not indexed yet (Manual policy): the warning should show before the user decides
  assert.equal(
    planZimEntryCensus('/app/storage/zim/a.zim', { ...base, state: 'pending_decision' }),
    'metadata_only'
  )
  assert.equal(
    planZimEntryCensus('/app/storage/zim/a.zim', { ...base, state: 'browse_only' }),
    'metadata_only'
  )
  // large indexed result: has real HTML content, not worth a scan-time walk
  assert.equal(
    planZimEntryCensus('/app/storage/zim/a.zim', {
      ...base,
      chunks_embedded: ZIM_CENSUS_FULL_SCAN_MAX_CHUNKS + 1,
    }),
    'metadata_only'
  )
})
