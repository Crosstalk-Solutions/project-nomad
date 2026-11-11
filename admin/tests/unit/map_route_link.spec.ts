import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMapPoint,
  parseMapRouteLink,
  formatMapPoint,
  mapPointerMoved,
} from '../../app/utils/map_route_link.js'

test('a route link restores endpoints and explicit profile without calculating by default', () => {
  const link = parseMapRouteLink(
    '?origin=-22.91,-43.17&destination=-23.55,-46.63&profile=pedestrian'
  )
  assert.equal(link.origin, '-22.910000, -43.170000')
  assert.equal(link.destination, '-23.550000, -46.630000')
  assert.equal(link.profile, 'pedestrian')
  assert.equal(link.autoroute, false)
})

test('an imported routing package version pin preserves case and rejects invalid syntax', () => {
  const link = parseMapRouteLink('?region=packs:imported-map&version=2026-Q4.Test_1')
  assert.equal(link.error, undefined)
  assert.equal(link.regionId, 'packs:imported-map')
  assert.equal(link.packageVersion, '2026-Q4.Test_1')
  for (const version of ['.hidden', '-Release', 'Release/2', 'Release 2', 'v'.repeat(101)]) {
    assert.ok(
      parseMapRouteLink(`?region=packs:imported-map&version=${encodeURIComponent(version)}`).error
    )
  }
  assert.ok(parseMapRouteLink('?region=packs:Imported-map&version=2026-Q4').error)
})
test('autoroute requires both valid points and preserves an exact dataset pin', () => {
  const link = parseMapRouteLink(
    '?origin=0,0&destination=1,2&profile=auto&autoroute=1&region=regions:brazil&version=2026-source'
  )
  assert.equal(link.autoroute, true)
  assert.equal(link.regionId, 'regions:brazil')
  assert.equal(link.packageVersion, '2026-source')
  for (const search of [
    '?autoroute=1',
    '?origin=91,0&destination=0,0&autoroute=1',
    '?origin=0,0&destination=1,2&profile=plane&autoroute=1',
    '?version=latest',
    '?origin=0,0&origin=1,1&autoroute=1',
    '?region=http://remote/&autoroute=1',
  ]) {
    const invalid = parseMapRouteLink(search)
    assert.ok(invalid.error)
    assert.equal(invalid.autoroute, false)
  }
})
test('point parsing rejects empty, nonfinite, hexadecimal and out-of-bounds inputs', () => {
  for (const value of [
    '',
    ',',
    '1,',
    'NaN,0',
    'Infinity,0',
    '0x10,20',
    '90.1,0',
    '0,-180.1',
    '1,2,3',
  ])
    assert.equal(parseMapPoint(value), null)
  assert.deepEqual(parseMapPoint(' -22.9 , -43.2 '), { lat: -22.9, lon: -43.2 })
  assert.equal(formatMapPoint({ lat: -22.9, lon: -43.2 }), '-22.900000, -43.200000')
})
test('right-button movement distinguishes clicks from camera gestures', () => {
  assert.equal(mapPointerMoved({ x: 10, y: 10 }, { x: 12, y: 12 }), false)
  assert.equal(mapPointerMoved({ x: 10, y: 10 }, { x: 50, y: 10 }), true)
})

test('route links restore intermediate stops in order without changing the destination', () => {
  const link = parseMapRouteLink('?origin=1,2&via1=3,4&via2=5,6&destination=7,8&autoroute=1')
  assert.deepEqual(link.vias, ['3.000000, 4.000000', '5.000000, 6.000000'])
  assert.equal(link.origin, '1.000000, 2.000000')
  assert.equal(link.destination, '7.000000, 8.000000')
  assert.equal(link.autoroute, true)
  assert.deepEqual(parseMapRouteLink('?origin=1,2&destination=3,4').vias, [])
})

test('intermediate stop links reject duplicates, invalid coordinates and a gap', () => {
  for (const search of [
    '?origin=1,2&via1=3,4&via1=5,6&destination=7,8&autoroute=1',
    '?origin=1,2&via2=3,4&destination=7,8&autoroute=1',
    '?origin=1,2&via1=91,0&destination=7,8&autoroute=1',
    '?origin=1,2&via1=3,4&via2=&destination=7,8&autoroute=1',
    '?origin=1,2&via3=3,4&destination=7,8&autoroute=1',
  ]) {
    const link = parseMapRouteLink(search)
    assert.ok(link.error)
    assert.equal(link.autoroute, false)
  }
})

test('seven-point links support five ordered vias, preserve old links and reject an eighth point', () => {
  const link = parseMapRouteLink(
    '?origin=0,0&via1=1,1&via2=2,2&via3=3,3&via4=4,4&via5=5,5&destination=6,6&autoroute=1'
  )
  assert.equal(link.error, undefined)
  assert.equal(link.vias.length, 5)
  assert.equal(link.vias[4], '5.000000, 5.000000')
  assert.equal(link.autoroute, true)
  for (const search of [
    '?origin=0,0&via1=1,1&via2=2,2&via3=3,3&via4=4,4&via5=5,5&via6=6,6&destination=7,7&autoroute=1',
    '?origin=0,0&via1=1,1&via3=3,3&destination=6,6&autoroute=1',
    '?origin=0,0&via1=1,1&via2=2,2&via3=3,3&via4=4,4&via5=5,5&via5=6,6&destination=7,7&autoroute=1',
    '?origin=0,0&via01=1,1&destination=2,2&autoroute=1',
  ]) {
    assert.ok(parseMapRouteLink(search).error)
    assert.equal(parseMapRouteLink(search).autoroute, false)
  }
})
