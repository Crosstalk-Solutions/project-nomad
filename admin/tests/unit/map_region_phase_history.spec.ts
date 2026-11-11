import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MapRegionPhaseHistory } from '../../app/services/map_region_phase_history.js'
import { applyBuilderProgress, persistRegionProgress } from '../../app/utils/map_region_progress.js'
import type { MapRegionOperation } from '../../types/map_regions.js'

async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-phase-history-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let now = Date.parse('2026-01-01T01:00:00Z')
  return {
    history: new MapRegionPhaseHistory(root, () => now),
    now: () => now,
    set: (value: number) => {
      now = value
    },
  }
}
const operation = (id: string, at: number): MapRegionOperation => ({
  id,
  type: 'install',
  phase: 'reading_source',
  detail: 'osm_two_pass_geometry_and_features',
  telemetry: 'reported',
  sourceFormat: 'osm-pbf',
  sourceBytes: 1000,
  phaseStartedAt: new Date(at).toISOString(),
  activity: 'active',
})

test('a phase ETA requires three comparable completed local measurements and is withdrawn when exceeded', async (t) => {
  const f = await fixture(t)
  for (let i = 0; i < 2; i++) {
    const old = operation(String(i), f.now() - 100000)
    await f.history.transition('search', old, { ...old, phase: 'building_search' })
  }
  let current = operation('current', f.now() - 10000)
  await f.history.estimate('search', current)
  assert.equal(current.etaBasis, undefined)
  const old = operation('third', f.now() - 120000)
  await f.history.transition('search', old, { ...old, phase: 'building_search' })
  await f.history.estimate('search', current)
  assert.equal(current.etaBasis, 'history')
  assert.equal(current.etaSamples, 3)
  assert(
    current.phaseEtaMinSeconds! > 0 && current.phaseEtaMaxSeconds! > current.phaseEtaMinSeconds!
  )
  f.set(f.now() + 180000)
  await f.history.estimate('search', current)
  assert.equal(current.etaBasis, undefined)
  assert.equal(current.phaseEtaMaxSeconds, undefined)
})

test('failures, different formats and waiting periods cannot train a misleading ETA', async (t) => {
  const f = await fixture(t)
  for (let i = 0; i < 4; i++) {
    const old = operation('failed-' + i, f.now() - 100000)
    await f.history.transition('search', old, { ...old, phase: 'failed' })
    await f.history.transition(
      'search',
      { ...old, id: 'csv-' + i, sourceFormat: 'cnefe-zip' },
      { ...old, phase: 'building_search' }
    )
    await f.history.transition(
      'search',
      { ...old, id: 'waiting-' + i, phase: 'queued' },
      { ...old, phase: 'reading_source' }
    )
  }
  const current = operation('current', f.now() - 10000)
  await f.history.estimate('search', current)
  assert.equal(current.etaBasis, undefined)
})

test('measured same-phase totals take precedence and waiting state clears estimates', async (t) => {
  const f = await fixture(t),
    current = {
      ...operation('current', f.now()),
      recordsProcessed: 25,
      recordsTotal: 100,
      recordsPerSecond: 5,
      lastProgressAt: new Date(f.now()).toISOString(),
    }
  await f.history.estimate('search', current)
  assert.equal(current.etaBasis, 'measured')
  assert.equal(current.phaseEtaMinSeconds, 12)
  assert.equal(current.phaseEtaMaxSeconds, 19)
  current.activity = 'waiting'
  await f.history.estimate('search', current)
  assert.equal(current.phaseEtaMinSeconds, undefined)
  assert.equal(current.etaBasis, undefined)
})

test('queued jobs clear stale started/detail/counters through builder projection and persistence', () => {
  const old: MapRegionOperation = {
    id: 'same',
    type: 'install',
    phase: 'building_routing',
    detail: 'routing_tiles',
    startedAt: '2026-01-01',
    recordsProcessed: 50,
    stageBytesProcessed: 100,
    phaseEtaMinSeconds: 2,
    phaseEtaMaxSeconds: 4,
    etaBasis: 'history',
  }
  const next = applyBuilderProgress(old, {
    status: 'queued',
    phase: 'queued',
    telemetryVersion: 1,
    queuedAt: '2026-01-02',
  })
  const saved = persistRegionProgress(
    { status: 'preparing', operation: old },
    { status: 'preparing', operation: next },
    'same',
    'routing'
  )
  for (const value of [next, saved]) {
    assert.equal(value.startedAt, undefined)
    assert.equal(value.detail, undefined)
    assert.equal(value.recordsProcessed, undefined)
    assert.equal(value.stageBytesProcessed, undefined)
    assert.equal(value.phaseEtaMinSeconds, undefined)
  }
})
