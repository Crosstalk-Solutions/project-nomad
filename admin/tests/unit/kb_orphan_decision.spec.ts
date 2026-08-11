import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideOrphans } from '../../app/utils/kb_orphan_decision.js'

test('no sources in Qdrant → no orphans', () => {
  assert.deepEqual(decideOrphans([], ['/storage/zim/a.zim']), [])
})

test('every Qdrant source still has a file on disk → no orphans', () => {
  assert.deepEqual(
    decideOrphans(['/storage/zim/a.zim', '/storage/zim/b.zim'], ['/storage/zim/a.zim', '/storage/zim/b.zim']),
    []
  )
})

test('a source with no matching file on disk is an orphan', () => {
  assert.deepEqual(
    decideOrphans(['/storage/zim/a.zim', '/storage/zim/gone.zim'], ['/storage/zim/a.zim']),
    ['/storage/zim/gone.zim']
  )
})

test('every Qdrant source is orphaned when none remain on disk (but disk scan was non-empty)', () => {
  assert.deepEqual(
    decideOrphans(['/storage/zim/gone1.zim', '/storage/zim/gone2.zim'], ['/storage/zim/unrelated.zim']),
    ['/storage/zim/gone1.zim', '/storage/zim/gone2.zim']
  )
})

test('empty disk scan is treated as a transient failure, not "everything was deleted"', () => {
  assert.equal(decideOrphans(['/storage/zim/a.zim', '/storage/zim/b.zim'], []), null)
})
