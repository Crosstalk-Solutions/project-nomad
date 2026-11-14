/**
 * Reset & Rebuild and Re-embed All re-embed a file only when the sync would dispatch it with
 * no chunks left: `decideScanAction(row, false, policy).kind === 'dispatch'`.
 * Guards against re-embedding every pending ZIM on a Manual-policy install.
 */
import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { decideScanAction } from '../../app/utils/kb_ingest_decision.js'

const rebuilds = (state: Parameters<typeof decideScanAction>[0], policy: 'Always' | 'Manual') =>
  decideScanAction(state, false, policy).kind === 'dispatch'

test('rebuild: indexed files are re-embedded under either policy', () => {
  assert.equal(rebuilds({ state: 'indexed' }, 'Manual'), true)
  assert.equal(rebuilds({ state: 'indexed' }, 'Always'), true)
})

test('rebuild: Manual policy leaves pending and unseen files alone', () => {
  assert.equal(rebuilds({ state: 'pending_decision' }, 'Manual'), false)
  assert.equal(rebuilds(null, 'Manual'), false)
})

test('rebuild: Always policy still indexes pending and unseen files', () => {
  assert.equal(rebuilds({ state: 'pending_decision' }, 'Always'), true)
  assert.equal(rebuilds(null, 'Always'), true)
})

test('rebuild: browse-only and failed files are never re-embedded automatically', () => {
  for (const state of ['browse_only', 'failed', 'stalled'] as const) {
    assert.equal(rebuilds({ state }, 'Always'), false, state)
  }
})
