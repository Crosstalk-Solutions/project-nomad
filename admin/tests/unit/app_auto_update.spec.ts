import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { DateTime } from 'luxon'

import { AppAutoUpdateService } from '../../app/services/app_auto_update_service.js'
import { ContainerRegistryService } from '../../app/services/container_registry_service.js'
import { isWithinWindow } from '../../app/utils/update_window.js'

// appEligibility only touches ContainerRegistryService.parseImageReference (pure,
// offline), so the other constructor deps are irrelevant for these tests.
const svc = new AppAutoUpdateService(
  null as any,
  null as any,
  null as any,
  new ContainerRegistryService()
)

const NOW = DateTime.fromISO('2026-06-04T12:00:00Z')
const daysAgo = (d: number) => NOW.minus({ days: d })
const hoursAgo = (h: number) => NOW.minus({ hours: h })

function makeService(overrides: Record<string, any> = {}) {
  return {
    service_name: 'nomad_test',
    container_image: 'ollama/ollama:0.18.1',
    available_update_version: null,
    available_update_first_seen_at: null,
    auto_update_disabled_reason: null,
    auto_update_enabled: true,
    installed: true,
    ...overrides,
  } as any
}

// ── Per-app eligibility ───────────────────────────────────────────────────────

test('no available update → not eligible (up to date)', () => {
  const v = svc.appEligibility(makeService(), 72, NOW)
  assert.equal(v.eligible, false)
})

test('major bump is never auto-eligible (manual update required)', () => {
  const v = svc.appEligibility(
    makeService({ available_update_version: '1.0.0', available_update_first_seen_at: daysAgo(10) }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
  assert.match(v.reason, /Major version/)
})

test('same-major newer but still inside cool-off → not eligible', () => {
  const v = svc.appEligibility(
    makeService({
      available_update_version: '0.19.0',
      available_update_first_seen_at: hoursAgo(10),
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
  assert.match(v.reason, /cool-off/i)
})

test('same-major newer and past cool-off → eligible', () => {
  const v = svc.appEligibility(
    makeService({ available_update_version: '0.19.0', available_update_first_seen_at: daysAgo(5) }),
    72,
    NOW
  )
  assert.equal(v.eligible, true)
})

test('null first-seen → not eligible (cool-off pending)', () => {
  const v = svc.appEligibility(
    makeService({ available_update_version: '0.19.0', available_update_first_seen_at: null }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
})

test('self-disabled app → not eligible regardless of cool-off', () => {
  const v = svc.appEligibility(
    makeService({
      available_update_version: '0.19.0',
      available_update_first_seen_at: daysAgo(30),
      auto_update_disabled_reason: 'Auto-update disabled after 3 consecutive failures.',
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
})

test(':latest-pinned app cannot be version-checked → not eligible', () => {
  const v = svc.appEligibility(
    makeService({
      container_image: 'foo/bar:latest',
      available_update_version: '1.2.3',
      available_update_first_seen_at: daysAgo(30),
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
})

test('available equal to current (not newer) → not eligible', () => {
  const v = svc.appEligibility(
    makeService({
      available_update_version: '0.18.1',
      available_update_first_seen_at: daysAgo(30),
    }),
    72,
    NOW
  )
  assert.equal(v.eligible, false)
})

test('cool-off of 0 applies immediately', () => {
  const v = svc.appEligibility(
    makeService({
      available_update_version: '0.18.2',
      available_update_first_seen_at: hoursAgo(1),
    }),
    0,
    NOW
  )
  assert.equal(v.eligible, true)
})

// ── Shared update window (reused from the core auto-update) ────────────────────

test('window: normal 20:00-23:00 includes 21:00, excludes 19:00', () => {
  assert.equal(isWithinWindow('20:00', '23:00', DateTime.fromISO('2026-06-04T21:00:00')), true)
  assert.equal(isWithinWindow('20:00', '23:00', DateTime.fromISO('2026-06-04T19:00:00')), false)
})

test('window: midnight-wrapping 22:00-02:00 includes 01:00, excludes 12:00', () => {
  assert.equal(isWithinWindow('22:00', '02:00', DateTime.fromISO('2026-06-04T01:00:00')), true)
  assert.equal(isWithinWindow('22:00', '02:00', DateTime.fromISO('2026-06-04T12:00:00')), false)
})
