import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { mapGfxToHsaOverride } from '../../app/utils/amd_hsa_override.js'

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
