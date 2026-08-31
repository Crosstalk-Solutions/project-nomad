import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { isMapAssetPath, isReadableMethod } from '../../app/middleware/maps_cors_middleware.js'

test('isMapAssetPath accepts the styles route, pmtiles, and basemaps-assets paths', () => {
  for (const path of [
    '/api/maps/styles',
    '/pmtiles/washington.pmtiles',
    '/basemaps-assets/fonts/Noto%20Sans%20Regular/0-255.pbf',
    '/basemaps-assets/sprites/v4/light.json',
    '/storage/maps/pmtiles/washington.pmtiles',
  ]) {
    assert.equal(isMapAssetPath(path), true, `${path} should be a map asset path`)
  }
})

test('isMapAssetPath rejects non-map paths and other /api/maps/ routes', () => {
  for (const path of [
    '/api/system/info',
    '/api/maps',
    '/api/mapsfoo',
    '/api/maps/regions',
    '/api/maps/download-remote',
    '/maps',
    '/',
    '/pmtiles',
    '/basemaps-assets',
  ]) {
    assert.equal(isMapAssetPath(path), false, `${path} should not be a map asset path`)
  }
})

test('isReadableMethod accepts GET, HEAD, and OPTIONS, rejects write methods', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(isReadableMethod(method), true, `${method} should be readable`)
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(isReadableMethod(method), false, `${method} should not be readable`)
  }
})
