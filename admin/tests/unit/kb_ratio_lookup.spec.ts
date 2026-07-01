import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BYTES_PER_CHUNK_ON_DISK,
  estimateBatch,
  estimateChunkCount,
  findChunksPerMb,
} from '../../app/utils/kb_ratio_lookup.js'

const SEEDED_ROWS = [
  { pattern: 'devdocs_', chunks_per_mb: 1100 },
  { pattern: 'wikipedia_en_simple_', chunks_per_mb: 270 },
  { pattern: 'wikipedia_en_', chunks_per_mb: 250 },
  { pattern: 'ifixit_', chunks_per_mb: 50 },
  { pattern: 'lrnselfreliance_', chunks_per_mb: 0 },
  { pattern: '', chunks_per_mb: 100 },
]

test('exact prefix match', () => {
  assert.equal(findChunksPerMb('devdocs_en_python_2026-02.zim', SEEDED_ROWS), 1100)
})

test('longest-prefix wins over broader sibling', () => {
  // wikipedia_en_simple_* should pick 270, not the 250 from wikipedia_en_
  assert.equal(
    findChunksPerMb('wikipedia_en_simple_all_nopic_2026-02.zim', SEEDED_ROWS),
    270
  )
})

test('broader prefix used when no specific match', () => {
  // wikipedia_en_medicine_* is not seeded; falls through to wikipedia_en_ at 250
  assert.equal(findChunksPerMb('wikipedia_en_medicine_nopic_2026-04.zim', SEEDED_ROWS), 250)
})

test('empty-string fallback catches unmatched filenames', () => {
  assert.equal(findChunksPerMb('something_unknown_2026-02.zim', SEEDED_ROWS), 100)
})

test('returns null when no row matches and no fallback is registered', () => {
  const rowsWithoutFallback = SEEDED_ROWS.filter((r) => r.pattern !== '')
  assert.equal(findChunksPerMb('something_unknown_2026-02.zim', rowsWithoutFallback), null)
})

test('zero-ratio entry returns 0, not null (video-only ZIMs)', () => {
  assert.equal(findChunksPerMb('lrnselfreliance_en_all_2025-12.zim', SEEDED_ROWS), 0)
})

test('estimateChunkCount scales by file size in MB', () => {
  // 100 MB * 1100 chunks/MB ≈ 110,000 chunks for devdocs
  const bytes = 100 * 1024 * 1024
  assert.equal(estimateChunkCount('devdocs_en_python_2026-02.zim', bytes, SEEDED_ROWS), 110000)
})

test('estimateChunkCount returns 0 for video-only ZIM regardless of size', () => {
  const bytes = 5 * 1024 * 1024 * 1024 // 5 GB
  assert.equal(estimateChunkCount('lrnselfreliance_en_all_2025-12.zim', bytes, SEEDED_ROWS), 0)
})

test('estimateChunkCount returns null when no match and no fallback', () => {
  const rowsWithoutFallback = SEEDED_ROWS.filter((r) => r.pattern !== '')
  assert.equal(
    estimateChunkCount('something_unknown_2026-02.zim', 50 * 1024 * 1024, rowsWithoutFallback),
    null
  )
})

test('ignoreCatchAll: returns null for filenames only the empty-pattern fallback would match (#913)', () => {
  // military-medicine matches no specific prefix; without ignoreCatchAll it would
  // hit the 100 chunks/MB fallback and wildly over-predict, falsely tripping
  // the partial_stall warning on a PDF/link-out-heavy ZIM.
  assert.equal(
    findChunksPerMb('irp.fas.org_en_military-medicine_2026-05.zim', SEEDED_ROWS, {
      ignoreCatchAll: true,
    }),
    null
  )
  assert.equal(
    estimateChunkCount('irp.fas.org_en_military-medicine_2026-05.zim', 75 * 1024 * 1024, SEEDED_ROWS, {
      ignoreCatchAll: true,
    }),
    null
  )
})

test('ignoreCatchAll: still honors a specific (non-empty) pattern match', () => {
  // A file that matches a real prefix should be unaffected by ignoreCatchAll.
  assert.equal(
    findChunksPerMb('wikipedia_en_simple_all_nopic_2026-02.zim', SEEDED_ROWS, {
      ignoreCatchAll: true,
    }),
    270
  )
})

test('estimateBatch sums chunks and bytes for matched files', () => {
  const files = [
    // 100 MB devdocs -> 110,000 chunks
    { filename: 'devdocs_en_python_2026-02.zim', sizeBytes: 100 * 1024 * 1024 },
    // 500 MB wikipedia_en_simple -> 135,000 chunks
    { filename: 'wikipedia_en_simple_all_nopic_2026-02.zim', sizeBytes: 500 * 1024 * 1024 },
  ]
  const out = estimateBatch(files, SEEDED_ROWS)
  assert.equal(out.totalChunks, 110_000 + 135_000)
  assert.equal(out.totalBytes, (110_000 + 135_000) * BYTES_PER_CHUNK_ON_DISK)
  assert.equal(out.hasUnknown, false)
})

test('estimateBatch sets hasUnknown when a file has no registry match', () => {
  // Drop the empty-string fallback so the unknown file truly has no match
  const rows = SEEDED_ROWS.filter((r) => r.pattern !== '')
  const files = [
    { filename: 'devdocs_en_python_2026-02.zim', sizeBytes: 100 * 1024 * 1024 },
    { filename: 'something_unknown_2026-02.zim', sizeBytes: 50 * 1024 * 1024 },
  ]
  const out = estimateBatch(files, rows)
  assert.equal(out.totalChunks, 110_000) // only the matched file
  assert.equal(out.hasUnknown, true)
})

test('estimateBatch handles video-only ZIMs (0 chunks/MB) without flagging hasUnknown', () => {
  // A 5 GB video ZIM matches the registry with 0 chunks/MB; that is a
  // *known* value, not an unknown — totals should be 0 and hasUnknown false.
  const files = [
    { filename: 'lrnselfreliance_en_all_2025-12.zim', sizeBytes: 5 * 1024 * 1024 * 1024 },
  ]
  const out = estimateBatch(files, SEEDED_ROWS)
  assert.equal(out.totalChunks, 0)
  assert.equal(out.totalBytes, 0)
  assert.equal(out.hasUnknown, false)
})

test('estimateBatch on empty input returns zeros', () => {
  const out = estimateBatch([], SEEDED_ROWS)
  assert.equal(out.totalChunks, 0)
  assert.equal(out.totalBytes, 0)
  assert.equal(out.hasUnknown, false)
})
