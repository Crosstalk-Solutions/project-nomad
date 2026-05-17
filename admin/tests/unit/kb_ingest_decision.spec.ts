import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideScanAction } from '../../app/utils/kb_ingest_decision.js'

// ---------- Always-policy cases (default behavior; preserves pre-policy install) ----------

test('Always: no state row, no chunks → dispatch and create row (new file)', () => {
  assert.deepEqual(decideScanAction(null, false, 'Always'), {
    kind: 'dispatch',
    createStateRow: true,
  })
})

test('Always: no state row, chunks present → backfill_indexed (pre-RFC install, existing Qdrant volume)', () => {
  assert.deepEqual(decideScanAction(null, true, 'Always'), { kind: 'backfill_indexed' })
})

test('Always: indexed + chunks present → skip', () => {
  assert.deepEqual(decideScanAction({ state: 'indexed' }, true, 'Always'), { kind: 'skip' })
})

test('Always: indexed + chunks missing → re-dispatch (Qdrant collection rebuilt or chunks deleted)', () => {
  assert.deepEqual(decideScanAction({ state: 'indexed' }, false, 'Always'), {
    kind: 'dispatch',
    createStateRow: false,
  })
})

test('Always: pending_decision → dispatch', () => {
  assert.deepEqual(decideScanAction({ state: 'pending_decision' }, false, 'Always'), {
    kind: 'dispatch',
    createStateRow: false,
  })
})

test('Always: browse_only → skip (user opted out of indexing)', () => {
  assert.deepEqual(decideScanAction({ state: 'browse_only' }, false, 'Always'), { kind: 'skip' })
})

test('Always: failed → skip (manual retry needed, do not auto-redispatch)', () => {
  assert.deepEqual(decideScanAction({ state: 'failed' }, false, 'Always'), { kind: 'skip' })
})

test('Always: stalled → skip (manual retry needed)', () => {
  assert.deepEqual(decideScanAction({ state: 'stalled' }, false, 'Always'), { kind: 'skip' })
})

// ---------- Manual-policy cases ----------

test('Manual: no state row, no chunks → create_pending (do not auto-dispatch new content)', () => {
  assert.deepEqual(decideScanAction(null, false, 'Manual'), { kind: 'create_pending' })
})

test('Manual: no state row, chunks present → backfill_indexed (same as Always — Qdrant is authoritative)', () => {
  assert.deepEqual(decideScanAction(null, true, 'Manual'), { kind: 'backfill_indexed' })
})

test('Manual: pending_decision → skip (waiting for user to opt in via Index button)', () => {
  assert.deepEqual(decideScanAction({ state: 'pending_decision' }, false, 'Manual'), {
    kind: 'skip',
  })
})

test('Manual: indexed + chunks missing → re-dispatch (user has already opted in for this file)', () => {
  // Policy switch from Always→Manual must not break in-flight or partially-deleted indexes
  // for files the user previously chose to index.
  assert.deepEqual(decideScanAction({ state: 'indexed' }, false, 'Manual'), {
    kind: 'dispatch',
    createStateRow: false,
  })
})

test('Manual: browse_only → skip (same as Always)', () => {
  assert.deepEqual(decideScanAction({ state: 'browse_only' }, false, 'Manual'), { kind: 'skip' })
})

// ---------- Policy default ----------

test('omitted policy defaults to Always (unset KV preserves legacy behavior)', () => {
  assert.deepEqual(decideScanAction(null, false), { kind: 'dispatch', createStateRow: true })
})
