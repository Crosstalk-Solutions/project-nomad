import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { describeKbSyncOutcome } from '../../app/utils/kb_sync_message.js'

const quiet = { filesScanned: 3, queued: 0, deduped: 0, createdPending: 0, backfilled: 0, note: '' }

test('nothing happened → already in sync, with any orphan note appended', () => {
  assert.equal(describeKbSyncOutcome(quiet), 'Knowledge base is already in sync')
  assert.equal(
    describeKbSyncOutcome({ ...quiet, note: '; purged 2 orphaned sources' }),
    'Knowledge base is already in sync; purged 2 orphaned sources'
  )
})

test('queued files keep the previous wording', () => {
  assert.equal(
    describeKbSyncOutcome({ ...quiet, queued: 2 }),
    'Scanned 3 files, queued 2 for embedding'
  )
  assert.equal(
    describeKbSyncOutcome({ ...quiet, queued: 2, deduped: 1 }),
    'Scanned 3 files, queued 2 for embedding (1 already queued)'
  )
})

test('rows added under Manual policy are reported instead of "already in sync" (#1465)', () => {
  assert.equal(
    describeKbSyncOutcome({ ...quiet, createdPending: 3 }),
    'Scanned 3 files, added 3 files to Stored Files, waiting for you to index them'
  )
  assert.equal(
    describeKbSyncOutcome({ ...quiet, createdPending: 1 }),
    'Scanned 3 files, added 1 file to Stored Files, waiting for you to index it'
  )
})

test('backfilled rows and combinations', () => {
  assert.equal(
    describeKbSyncOutcome({ ...quiet, backfilled: 1 }),
    'Scanned 3 files, recorded 1 already-indexed file'
  )
  assert.equal(
    describeKbSyncOutcome({
      ...quiet,
      queued: 1,
      createdPending: 2,
      backfilled: 3,
      note: '; purged 1 orphaned source',
    }),
    'Scanned 3 files, queued 1 for embedding, added 2 files to Stored Files, waiting for you to index them, recorded 3 already-indexed files; purged 1 orphaned source'
  )
})
