import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideScanAction } from '../../app/utils/kb_ingest_decision.js'

test('no state row, no chunks → dispatch and create row (new file)', () => {
  assert.deepEqual(decideScanAction(null, false), { kind: 'dispatch', createStateRow: true })
})

test('no state row, chunks present → backfill_indexed (pre-RFC install, existing Qdrant volume)', () => {
  assert.deepEqual(decideScanAction(null, true), { kind: 'backfill_indexed' })
})

test('indexed + chunks present → skip', () => {
  assert.deepEqual(decideScanAction({ state: 'indexed' }, true), { kind: 'skip' })
})

test('indexed + chunks missing → re-dispatch (state stale, Qdrant collection rebuilt or chunks deleted)', () => {
  assert.deepEqual(decideScanAction({ state: 'indexed' }, false), {
    kind: 'dispatch',
    createStateRow: false,
  })
})

test('pending_decision → dispatch (preserves current Always behavior until policy is consumed)', () => {
  assert.deepEqual(decideScanAction({ state: 'pending_decision' }, false), {
    kind: 'dispatch',
    createStateRow: false,
  })
})

test('browse_only → skip (user opted out of indexing)', () => {
  assert.deepEqual(decideScanAction({ state: 'browse_only' }, false), { kind: 'skip' })
})

test('browse_only + chunks present → skip (do not silently re-index after un-index)', () => {
  assert.deepEqual(decideScanAction({ state: 'browse_only' }, true), { kind: 'skip' })
})

test('failed → skip (manual retry needed, do not auto-redispatch)', () => {
  assert.deepEqual(decideScanAction({ state: 'failed' }, false), { kind: 'skip' })
})

test('stalled → skip (manual retry needed)', () => {
  assert.deepEqual(decideScanAction({ state: 'stalled' }, false), { kind: 'skip' })
})
