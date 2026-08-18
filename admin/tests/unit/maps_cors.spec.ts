import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { isMapAssetPath } from '../../app/middleware/maps_cors_middleware.js'

test('isMapAssetPath accepts map style, pmtiles, and basemaps-assets paths', () => {
  for (const path of [
    '/api/maps/styles',
    '/api/maps/regions',
    '/pmtiles/washington.pmtiles',
    '/basemaps-assets/fonts/Noto%20Sans%20Regular/0-255.pbf',
    '/basemaps-assets/sprites/v4/light.json',
    '/storage/maps/pmtiles/washington.pmtiles',
  ]) {
    assert.equal(isMapAssetPath(path), true, `${path} should be a map asset path`)
  }
})

test('isMapAssetPath rejects non-map paths, including a near-miss without the trailing slash', () => {
  for (const path of ['/api/system/info', '/api/maps', '/api/mapsfoo', '/maps', '/', '/pmtiles', '/basemaps-assets']) {
    assert.equal(isMapAssetPath(path), false, `${path} should not be a map asset path`)
  }
})
