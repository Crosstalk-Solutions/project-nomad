import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { effectiveCapacity, mapRegionCapacity } from '../../app/utils/map_region_capacity.js'
import { MapRegionError } from '../../app/utils/map_region_catalog.js'

async function directory(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-capacity-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function unsetBacking(t: any) {
  const previous = process.env.MAP_REGIONS_BACKING_DISK_PATH
  delete process.env.MAP_REGIONS_BACKING_DISK_PATH
  t.after(() => {
    if (previous === undefined) delete process.env.MAP_REGIONS_BACKING_DISK_PATH
    else process.env.MAP_REGIONS_BACKING_DISK_PATH = previous
  })
}

test('native storage uses its available bytes without inventing a backing disk', () => {
  assert.deepEqual(effectiveCapacity(250), {
    availableBytes: 250,
    volumeAvailableBytes: 250,
  })
})

test('the smaller physical or virtual capacity limits preparation', () => {
  assert.deepEqual(effectiveCapacity(491, 236), {
    availableBytes: 236,
    volumeAvailableBytes: 491,
    backingAvailableBytes: 236,
  })
  assert.equal(effectiveCapacity(100, 236).availableBytes, 100)
})

test('a full backing disk or data volume remains zero rather than falling back', () => {
  assert.equal(effectiveCapacity(491, 0).availableBytes, 0)
  assert.equal(effectiveCapacity(0, 236).availableBytes, 0)
})

test('invalid capacity never silently bypasses the storage admission check', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => effectiveCapacity(value), { status: 503 })
    assert.throws(() => effectiveCapacity(491, value), { status: 503 })
  }
})

test('the native default reads a real data filesystem', async (t) => {
  unsetBacking(t)
  const root = await directory(t)
  const result = await mapRegionCapacity(root)
  assert.ok(Number.isFinite(result.availableBytes) && result.availableBytes >= 0)
  assert.equal(result.availableBytes, result.volumeAvailableBytes)
  assert.equal(result.backingAvailableBytes, undefined)
})

test('a configured read-only-compatible directory probe contributes its filesystem capacity', async (t) => {
  const root = await directory(t)
  const backing = join(root, 'backing-probe')
  await mkdir(backing)
  const result = await mapRegionCapacity(root, backing)
  assert.ok(Number.isFinite(result.backingAvailableBytes))
  assert.equal(
    result.availableBytes,
    Math.min(result.volumeAvailableBytes, result.backingAvailableBytes!)
  )
})

test('missing configured backing storage fails closed without exposing its host path', async (t) => {
  const root = await directory(t)
  const missing = join(root, 'private-host-probe-not-mounted')
  await assert.rejects(mapRegionCapacity(root, missing), (error: unknown) => {
    assert.ok(error instanceof MapRegionError)
    assert.equal(error.status, 503)
    assert.match(error.message, /configured backing disk/)
    assert.ok(!error.message.includes(missing))
    return true
  })
})

test('relative or empty configured probe paths fail closed', async (t) => {
  const root = await directory(t)
  for (const path of ['relative/probe', ''])
    await assert.rejects(mapRegionCapacity(root, path), (error: unknown) => {
      assert.ok(error instanceof MapRegionError)
      assert.equal(error.status, 503)
      assert.match(error.message, /absolute container path/)
      return true
    })
})

test('the optional environment setting is enforced instead of silently ignored', async (t) => {
  unsetBacking(t)
  const root = await directory(t)
  process.env.MAP_REGIONS_BACKING_DISK_PATH = join(root, 'unmounted')
  await assert.rejects(mapRegionCapacity(root), { status: 503 })
})

test('missing map storage also produces a descriptive service error', async (t) => {
  unsetBacking(t)
  const root = await directory(t)
  await assert.rejects(mapRegionCapacity(join(root, 'missing-data')), (error: unknown) => {
    assert.ok(error instanceof MapRegionError)
    assert.equal(error.status, 503)
    assert.match(error.message, /maps data volume/)
    return true
  })
})
