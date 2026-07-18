import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MAX_CONSECUTIVE_FAILURES,
  recordResourceUpdateFailure,
  recordResourceUpdateSuccess,
} from '../../app/utils/content_auto_update_backoff.js'

// The helpers only read/write two columns and call save(); a plain object with a
// save spy stands in for the Lucid model so the backoff logic is testable without
// a database.
function makeResource(overrides: Record<string, any> = {}) {
  let saved = 0
  return {
    resource_id: 'wikipedia_en_all_maxi',
    auto_update_consecutive_failures: 0,
    auto_update_disabled_reason: null as string | null,
    async save() {
      saved++
    },
    get saveCount() {
      return saved
    },
    ...overrides,
  } as any
}

// ── Failure backoff ─────────────────────────────────────────────────────────────

test('failure increments the consecutive counter', async () => {
  const r = makeResource()
  await recordResourceUpdateFailure(r, 'network error')
  assert.equal(r.auto_update_consecutive_failures, 1)
  assert.equal(r.auto_update_disabled_reason, null)
})

test('failures below the threshold do not self-disable', async () => {
  const r = makeResource({ auto_update_consecutive_failures: 1 })
  await recordResourceUpdateFailure(r, 'network error')
  assert.equal(r.auto_update_consecutive_failures, 2)
  assert.equal(r.auto_update_disabled_reason, null)
})

test('reaching the threshold self-disables with the last error in the reason', async () => {
  const r = makeResource({ auto_update_consecutive_failures: MAX_CONSECUTIVE_FAILURES - 1 })
  await recordResourceUpdateFailure(r, 'disk full')
  assert.equal(r.auto_update_consecutive_failures, MAX_CONSECUTIVE_FAILURES)
  assert.match(r.auto_update_disabled_reason, /disabled after 3 consecutive failures/i)
  assert.match(r.auto_update_disabled_reason, /disk full/)
})

test('failure always persists', async () => {
  const r = makeResource()
  await recordResourceUpdateFailure(r, 'boom')
  assert.equal(r.saveCount, 1)
})

// ── Success reset ───────────────────────────────────────────────────────────────

test('success clears the counter and the disabled reason', async () => {
  const r = makeResource({
    auto_update_consecutive_failures: 3,
    auto_update_disabled_reason: 'Auto-update disabled after 3 consecutive failures.',
  })
  await recordResourceUpdateSuccess(r)
  assert.equal(r.auto_update_consecutive_failures, 0)
  assert.equal(r.auto_update_disabled_reason, null)
  assert.equal(r.saveCount, 1)
})

test('success is a no-op (no save) when already clean', async () => {
  const r = makeResource({ auto_update_consecutive_failures: 0, auto_update_disabled_reason: null })
  await recordResourceUpdateSuccess(r)
  assert.equal(r.saveCount, 0)
})

test('success still resets when a stray reason lingers at zero failures', async () => {
  const r = makeResource({ auto_update_consecutive_failures: 0, auto_update_disabled_reason: 'stale' })
  await recordResourceUpdateSuccess(r)
  assert.equal(r.auto_update_disabled_reason, null)
  assert.equal(r.saveCount, 1)
})
