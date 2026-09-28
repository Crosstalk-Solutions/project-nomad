import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  mapGfxToHsaOverride,
  pickAmdHsaOverride,
  readHsaOverrideFromEnv,
} from '../../app/utils/amd_hsa_override.js'

test('gfx1103 (Phoenix 780M) coerces to 11.0.0 — the #1076 regression', () => {
  // Not on the bundled rocblas allowlist; without this ollama drops it to CPU.
  assert.equal(mapGfxToHsaOverride('gfx1103'), '11.0.0')
})

test('gfx1150 / gfx1151 (Strix 890M, Strix Halo) stay native — no override', () => {
  // These ARE on the allowlist; forcing an override would needlessly coerce them.
  assert.equal(mapGfxToHsaOverride('gfx1150'), null)
  assert.equal(mapGfxToHsaOverride('gfx1151'), null)
})

test('RDNA 2 iGPUs (gfx1031..gfx1036, e.g. 680M) coerce to 10.3.0', () => {
  assert.equal(mapGfxToHsaOverride('gfx1035'), '10.3.0')
  assert.equal(mapGfxToHsaOverride('gfx1031'), '10.3.0')
  assert.equal(mapGfxToHsaOverride('gfx1036'), '10.3.0')
})

test('discrete cards on the ROCm allowlist get no override', () => {
  for (const gfx of ['gfx1030', 'gfx1100', 'gfx1101', 'gfx1102']) {
    assert.equal(mapGfxToHsaOverride(gfx), null)
  }
})

test('unknown / newer targets default to native discovery (no override)', () => {
  assert.equal(mapGfxToHsaOverride('gfx9999'), null)
  assert.equal(mapGfxToHsaOverride(''), null)
})

const OVERRIDE_ENV = ['OLLAMA_NO_CLOUD=1', 'HSA_OVERRIDE_GFX_VERSION=11.0.0']

test('readHsaOverrideFromEnv reads the override or null', () => {
  assert.equal(readHsaOverrideFromEnv(OVERRIDE_ENV), '11.0.0')
  assert.equal(readHsaOverrideFromEnv(['OLLAMA_NO_CLOUD=1']), null)
  assert.equal(readHsaOverrideFromEnv(null), null)
})

test('pickAmdHsaOverride: a KV version wins over the marker and container', () => {
  assert.deepEqual(pickAmdHsaOverride({ manual: '10.3.0', markerGfx: 'gfx1103', containerEnv: OVERRIDE_ENV }), {
    value: '10.3.0',
    source: 'kv',
  })
})

test('pickAmdHsaOverride: KV none disables even a container override', () => {
  assert.deepEqual(pickAmdHsaOverride({ manual: 'none', markerGfx: null, containerEnv: OVERRIDE_ENV }), {
    value: null,
    source: 'kv-disabled',
  })
})

test('pickAmdHsaOverride: a marker is authoritative even when it maps to none', () => {
  assert.deepEqual(pickAmdHsaOverride({ manual: null, markerGfx: 'gfx1151', containerEnv: OVERRIDE_ENV }), {
    value: null,
    source: 'marker',
  })
})

test('pickAmdHsaOverride keeps the container override with no KV or marker (#1377)', () => {
  assert.deepEqual(pickAmdHsaOverride({ manual: null, markerGfx: null, containerEnv: OVERRIDE_ENV }), {
    value: '11.0.0',
    source: 'container',
  })
  assert.deepEqual(pickAmdHsaOverride({ manual: '', markerGfx: null, containerEnv: OVERRIDE_ENV }), {
    value: '11.0.0',
    source: 'container',
  })
})

test('pickAmdHsaOverride ignores a malformed container override', () => {
  assert.deepEqual(
    pickAmdHsaOverride({ manual: null, markerGfx: null, containerEnv: ['HSA_OVERRIDE_GFX_VERSION=gfx1103'] }),
    { value: null, source: 'default' }
  )
})

test('pickAmdHsaOverride skips an invalid KV value and reports it', () => {
  assert.deepEqual(pickAmdHsaOverride({ manual: 'bogus', markerGfx: null, containerEnv: OVERRIDE_ENV }), {
    value: '11.0.0',
    source: 'container',
    invalidManual: 'bogus',
  })
})
