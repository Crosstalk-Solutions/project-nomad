import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { DateTime } from 'luxon'

import {
  ContentAutoUpdateService,
  type ContentCandidate,
} from '../../app/services/content_auto_update_service.js'
import { isWithinWindow } from '../../app/utils/update_window.js'

// resourceEligibility + selectUnderCap are pure; the I/O constructor deps are
// irrelevant for these tests, so null them out.
const svc = new ContentAutoUpdateService(null as any, null as any, null as any)

const NOW = DateTime.fromISO('2026-06-04T03:00:00Z')
const daysAgo = (d: number) => NOW.minus({ days: d })
const hoursAgo = (h: number) => NOW.minus({ hours: h })

function makeResource(overrides: Record<string, any> = {}) {
  return {
    resource_id: 'wikipedia_en_all_maxi',
    resource_type: 'zim',
    version: '2024-01',
    available_update_version: null,
    available_update_size_bytes: null,
    available_update_first_seen_at: null,
    auto_update_disabled_reason: null,
    auto_update_consecutive_failures: 0,
    installed_at: daysAgo(100),
    ...overrides,
  } as any
}

function makeCandidate(overrides: Partial<ContentCandidate> & { id?: string } = {}): ContentCandidate {
  const { id, ...rest } = overrides
  return {
    resource: makeResource({ resource_id: id ?? 'res' }) as any,
    version: '2024-06',
    download_url: `https://download.kiwix.org/zim/${id ?? 'res'}_2024-06.zim`,
    size_bytes: 1_000,
    installed_at: daysAgo(100),
    ...rest,
  }
}

// ── Per-resource eligibility ───────────────────────────────────────────────────

test('no available update → not eligible (up to date)', () => {
  const v = svc.resourceEligibility(makeResource(), 72, NOW)
  assert.equal(v.eligible, false)
  assert.match(v.reason, /up to date/i)
})

test('newer version but still inside cool-off → not eligible', () => {
  const v = svc.resourceEligibility(
    makeResource({
      available_update_version: '2024-06',
      available_update_first_seen_at: hoursAgo(10),
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
  assert.match(v.reason, /cool-off/i)
})

test('newer version past cool-off → eligible', () => {
  const v = svc.resourceEligibility(
    makeResource({
      available_update_version: '2024-06',
      available_update_first_seen_at: daysAgo(5),
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, true)
})

test('null first-seen → not eligible (cool-off pending)', () => {
  const v = svc.resourceEligibility(
    makeResource({ available_update_version: '2024-06', available_update_first_seen_at: null }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
  assert.match(v.reason, /cool-off pending/i)
})

test('self-disabled resource → not eligible regardless of cool-off', () => {
  const v = svc.resourceEligibility(
    makeResource({
      available_update_version: '2024-06',
      available_update_first_seen_at: daysAgo(30),
      auto_update_disabled_reason: 'Auto-update disabled after 3 consecutive failures.',
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
})

test('available equal to current (not newer) → not eligible', () => {
  const v = svc.resourceEligibility(
    makeResource({
      available_update_version: '2024-01',
      available_update_first_seen_at: daysAgo(30),
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
})

test('cool-off of 0 applies immediately', () => {
  const v = svc.resourceEligibility(
    makeResource({
      available_update_version: '2024-06',
      available_update_first_seen_at: hoursAgo(1),
    }),
    0,
    NOW
  )
  assert.equal(v.eligible, true)
})

// ── Cap-bounded selection ──────────────────────────────────────────────────────

test('under cap selects everything', () => {
  const candidates = [
    makeCandidate({ id: 'a', size_bytes: 1_000 }),
    makeCandidate({ id: 'b', size_bytes: 2_000 }),
  ]
  const { selected, skippedOversize, deferred } = svc.selectUnderCap(candidates, 10_000, 0)
  assert.equal(selected.length, 2)
  assert.equal(skippedOversize.length, 0)
  assert.equal(deferred.length, 0)
})

test('cap 0 means unlimited', () => {
  const candidates = [makeCandidate({ id: 'a', size_bytes: 9_999_999_999 })]
  const { selected, skippedOversize } = svc.selectUnderCap(candidates, 0, 0)
  assert.equal(selected.length, 1)
  assert.equal(skippedOversize.length, 0)
})

test('single file larger than the whole cap → skippedOversize, never selected', () => {
  const candidates = [makeCandidate({ id: 'huge', size_bytes: 50_000 })]
  const { selected, skippedOversize, deferred } = svc.selectUnderCap(candidates, 20_000, 0)
  assert.equal(selected.length, 0)
  assert.equal(skippedOversize.length, 1)
  assert.equal(deferred.length, 0)
})

test('fits the cap but not this window’s remaining budget → deferred', () => {
  const candidates = [makeCandidate({ id: 'mid', size_bytes: 8_000 })]
  // cap 10k, already used 5k → only 5k remaining; 8k fits the cap but not the budget.
  const { selected, deferred, skippedOversize } = svc.selectUnderCap(candidates, 10_000, 5_000)
  assert.equal(selected.length, 0)
  assert.equal(deferred.length, 1)
  assert.equal(skippedOversize.length, 0)
})

test('greedy oldest-first selection packs until budget exhausted', () => {
  const candidates = [
    makeCandidate({ id: 'new', size_bytes: 4_000, installed_at: daysAgo(1) }),
    makeCandidate({ id: 'old', size_bytes: 4_000, installed_at: daysAgo(50) }),
    makeCandidate({ id: 'mid', size_bytes: 4_000, installed_at: daysAgo(25) }),
  ]
  const { selected, deferred } = svc.selectUnderCap(candidates, 10_000, 0)
  // 10k budget / 4k each → 2 selected (oldest two), 1 deferred.
  assert.equal(selected.length, 2)
  assert.equal(deferred.length, 1)
  assert.deepEqual(
    selected.map((c) => c.resource.resource_id),
    ['old', 'mid']
  )
})

test('budget already exhausted → everything deferred', () => {
  const candidates = [makeCandidate({ id: 'a', size_bytes: 1_000 })]
  const { selected, deferred } = svc.selectUnderCap(candidates, 5_000, 5_000)
  assert.equal(selected.length, 0)
  assert.equal(deferred.length, 1)
})

test('unknown size (0) → deferred, never selected', () => {
  const candidates = [makeCandidate({ id: 'a', size_bytes: 0 })]
  const { selected, deferred, skippedOversize } = svc.selectUnderCap(candidates, 10_000, 0)
  assert.equal(selected.length, 0)
  assert.equal(deferred.length, 1)
  assert.equal(skippedOversize.length, 0)
})

// ── Window boundary math (per-window budget reset) ─────────────────────────────

test('windowStartBoundary: same-day window resolves to today’s start', () => {
  const now = DateTime.fromISO('2026-06-04T03:30:00')
  const boundary = svc.windowStartBoundary('02:00', now)
  assert.equal(boundary.toISO(), DateTime.fromISO('2026-06-04T02:00:00').toISO())
})

test('windowStartBoundary: before today’s start resolves to yesterday (wrap window)', () => {
  const now = DateTime.fromISO('2026-06-04T01:00:00')
  const boundary = svc.windowStartBoundary('22:00', now)
  assert.equal(boundary.toISO(), DateTime.fromISO('2026-06-03T22:00:00').toISO())
})

// ── Shared update window ───────────────────────────────────────────────────────

test('window: normal 02:00-05:00 includes 03:00, excludes 06:00', () => {
  assert.equal(isWithinWindow('02:00', '05:00', DateTime.fromISO('2026-06-04T03:00:00')), true)
  assert.equal(isWithinWindow('02:00', '05:00', DateTime.fromISO('2026-06-04T06:00:00')), false)
})

test('window: midnight-wrapping 22:00-02:00 includes 01:00, excludes 12:00', () => {
  assert.equal(isWithinWindow('22:00', '02:00', DateTime.fromISO('2026-06-04T01:00:00')), true)
  assert.equal(isWithinWindow('22:00', '02:00', DateTime.fromISO('2026-06-04T12:00:00')), false)
})
