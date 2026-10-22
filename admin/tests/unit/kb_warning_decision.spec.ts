import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideWarnings } from '../../app/utils/kb_warning_decision.js'

const MB = 1024 * 1024

test('healthy file: chunks present and on-target → no warnings', () => {
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 100 * MB,
      chunksInQdrant: 11_000,
      expectedChunks: 11_000,
    }),
    []
  )
})

test('healthy file: chunks slightly above expectation → no warnings', () => {
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 100 * MB,
      chunksInQdrant: 12_000,
      expectedChunks: 11_000,
    }),
    []
  )
})

test('Warning A: large file with 0 chunks (video-only ZIM)', () => {
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 5 * 1024 * MB,
      chunksInQdrant: 0,
      expectedChunks: 0,
    }),
    [{ kind: 'zero_chunks', fileSizeBytes: 5 * 1024 * MB }]
  )
})

test('Warning A: small empty file is silently ignored (under 100 MB threshold)', () => {
  // A user uploads a 5 KB placeholder.txt that produces nothing → not worth a banner
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 5 * 1024, // 5 KB
      chunksInQdrant: 0,
      expectedChunks: null,
    }),
    []
  )
})

test('Warning B: partial stall — chunks well below expectation', () => {
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 1000 * MB,
      chunksInQdrant: 266,
      expectedChunks: 600_000,
    }),
    [{ kind: 'partial_stall', chunksEmbedded: 266, chunksExpected: 600_000 }]
  )
})

test('Warning B: chunks just under 50% of expected → triggers', () => {
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 100 * MB,
      chunksInQdrant: 4_999,
      expectedChunks: 10_000,
    }),
    [{ kind: 'partial_stall', chunksEmbedded: 4_999, chunksExpected: 10_000 }]
  )
})

test('Warning B: chunks at exactly 50% of expected → does NOT trigger', () => {
  // Strict less-than threshold leaves room for the boundary
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 100 * MB,
      chunksInQdrant: 5_000,
      expectedChunks: 10_000,
    }),
    []
  )
})

test('Warning B suppressed when expectedChunks is null (registry miss)', () => {
  // Better to be silent than show a meaningless "266 of unknown" comparison
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 100 * MB,
      chunksInQdrant: 266,
      expectedChunks: null,
    }),
    []
  )
})

test('Warning B suppressed when expectedChunks is 0 (video-only registry entry)', () => {
  // A `lrnselfreliance_` row in the registry says "expect 0 chunks". A real
  // file matching it correctly producing 0 chunks must not trigger Warning B.
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 500 * MB,
      chunksInQdrant: 0,
      expectedChunks: 0,
    }),
    // Note: Warning A triggers here because file > 100 MB and chunks = 0
    [{ kind: 'zero_chunks', fileSizeBytes: 500 * MB }]
  )
})

test('Both warnings can fire on the same file in principle', () => {
  // Edge case: huge file, 0 chunks, but ratio registry expected 100k.
  // Warning A fires (large + zero), Warning B suppressed (chunksInQdrant must be > 0).
  // This documents the chunksInQdrant > 0 guard on Warning B.
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 1000 * MB,
      chunksInQdrant: 0,
      expectedChunks: 100_000,
    }),
    [{ kind: 'zero_chunks', fileSizeBytes: 1000 * MB }]
  )
})

test('Warning C: a ZIM that is a shelf of PDFs behind a shell page (#1445)', () => {
  // Military Medicine: 25 PDFs, 1 HTML index page, 1 chunk. Reads as healthy
  // without the census: chunks > 0 and partial_stall is suppressed for it.
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 77 * MB,
      chunksInQdrant: 1,
      expectedChunks: null,
      htmlEntries: 1,
      pdfEntries: 25,
    }),
    [{ kind: 'pdf_entries_skipped', pdfEntries: 25, htmlEntries: 1 }]
  )
})

test('Warning C stays silent for a text site with a few attached PDFs', () => {
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 300 * MB,
      chunksInQdrant: 20_000,
      expectedChunks: 20_000,
      htmlEntries: 1_996,
      pdfEntries: 12,
    }),
    []
  )
})

test('Warning C stays silent without a census (pre-existing rows, non-ZIM files)', () => {
  assert.deepEqual(
    decideWarnings({
      fileSizeBytes: 77 * MB,
      chunksInQdrant: 1,
      expectedChunks: null,
      htmlEntries: null,
      pdfEntries: null,
    }),
    []
  )
  assert.deepEqual(
    decideWarnings({ fileSizeBytes: 77 * MB, chunksInQdrant: 1, expectedChunks: null }),
    []
  )
})

test('Warning C fires at exactly half PDF entries and not below', () => {
  const half = decideWarnings({
    fileSizeBytes: 1 * MB,
    chunksInQdrant: 3,
    expectedChunks: null,
    htmlEntries: 10,
    pdfEntries: 10,
  })
  assert.equal(half.length, 1)
  const below = decideWarnings({
    fileSizeBytes: 1 * MB,
    chunksInQdrant: 3,
    expectedChunks: null,
    htmlEntries: 11,
    pdfEntries: 10,
  })
  assert.deepEqual(below, [])
})
