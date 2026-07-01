import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  GUARDRAIL_ABSOLUTE_BYTES,
  GUARDRAIL_FREE_DISK_RATIO,
  evaluateGuardrail,
} from '../../inertia/lib/kb_guardrail.js'

const GB = 1024 * 1024 * 1024

test('small batch does not trip the guardrail', () => {
  const verdict = evaluateGuardrail({
    estimateBytes: 1 * GB, // 1 GB
    freeBytes: 500 * GB,
  })
  assert.equal(verdict.trips, false)
  assert.deepEqual(verdict.reasons, [])
})

test('batch at exactly the absolute threshold trips', () => {
  const verdict = evaluateGuardrail({
    estimateBytes: GUARDRAIL_ABSOLUTE_BYTES,
    freeBytes: 1000 * GB,
  })
  assert.equal(verdict.trips, true)
  assert.equal(verdict.reasons.length, 1)
  assert.equal(verdict.reasons[0].kind, 'over_absolute')
})

test('batch over the absolute threshold trips with over_absolute reason', () => {
  const verdict = evaluateGuardrail({
    estimateBytes: 60 * GB,
    freeBytes: 1000 * GB,
  })
  const overAbsolute = verdict.reasons.find((r) => r.kind === 'over_absolute')
  assert.ok(overAbsolute, 'should include over_absolute reason')
  assert.equal(verdict.trips, true)
})

test('batch over 10% of free disk trips with over_free_disk reason', () => {
  // 5 GB estimate against 40 GB free disk -> 5 > 4 (10% of 40)
  const verdict = evaluateGuardrail({
    estimateBytes: 5 * GB,
    freeBytes: 40 * GB,
  })
  const overFree = verdict.reasons.find((r) => r.kind === 'over_free_disk')
  assert.ok(overFree, 'should include over_free_disk reason')
  assert.equal(verdict.trips, true)
})

test('batch can trip BOTH thresholds simultaneously', () => {
  // 100 GB estimate, 200 GB free
  // - over absolute (100 > 50)
  // - over 10% of free (100 > 20)
  const verdict = evaluateGuardrail({
    estimateBytes: 100 * GB,
    freeBytes: 200 * GB,
  })
  assert.equal(verdict.trips, true)
  assert.equal(verdict.reasons.length, 2)
  assert.ok(verdict.reasons.some((r) => r.kind === 'over_absolute'))
  assert.ok(verdict.reasons.some((r) => r.kind === 'over_free_disk'))
})

test('freeBytes = 0 skips the relative-disk check', () => {
  // 100 MB estimate, no free-disk signal: only the absolute check runs,
  // and 100 MB is well below the 50 GB absolute threshold
  const verdict = evaluateGuardrail({
    estimateBytes: 100 * 1024 * 1024,
    freeBytes: 0,
  })
  assert.equal(verdict.trips, false)
})

test('freeBytes = 0 still trips the absolute check at 50 GB', () => {
  const verdict = evaluateGuardrail({
    estimateBytes: 100 * GB,
    freeBytes: 0,
  })
  assert.equal(verdict.trips, true)
  assert.equal(verdict.reasons.length, 1)
  assert.equal(verdict.reasons[0].kind, 'over_absolute')
})

test('relative-disk threshold computed from GUARDRAIL_FREE_DISK_RATIO constant', () => {
  // Estimate exactly equal to 10% of free -> trips (>=)
  const free = 100 * GB
  const exactlyTenPercent = free * GUARDRAIL_FREE_DISK_RATIO
  const verdict = evaluateGuardrail({
    estimateBytes: exactlyTenPercent,
    freeBytes: free,
  })
  const overFree = verdict.reasons.find((r) => r.kind === 'over_free_disk')
  assert.ok(overFree, 'should trip at exactly the threshold')
})

test('batch just under both thresholds does not trip', () => {
  // 4 GB estimate vs 50 GB free -> 10% of 50 = 5 GB, so 4 < 5
  // Also well below 50 GB absolute
  const verdict = evaluateGuardrail({
    estimateBytes: 4 * GB,
    freeBytes: 50 * GB,
  })
  assert.equal(verdict.trips, false)
})
