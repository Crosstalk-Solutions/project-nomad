import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { hasDownloadedGlobalMap } from '../../inertia/lib/global_map_banner.js'

test('returns true when the global map key already exists on disk', () => {
  assert.equal(
    hasDownloadedGlobalMap('20260402.pmtiles', [
      { name: '20260402.pmtiles' },
      { name: 'california.pmtiles' },
    ]),
    true
  )
})

test('returns false when the global map key is missing', () => {
  assert.equal(
    hasDownloadedGlobalMap('20260402.pmtiles', [
      { name: 'california.pmtiles' },
    ]),
    false
  )
})

test('returns false when there is no global map info', () => {
  assert.equal(hasDownloadedGlobalMap(undefined, [{ name: '20260402.pmtiles' }]), false)
})
