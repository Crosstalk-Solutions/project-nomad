import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createRouteStops,
  isOfflineRouteResult,
  moveRouteStop,
  parsedRouteStops,
  routeInstructionsText,
  routePointLabel,
  type OfflineRouteResult,
} from '../../app/utils/map_route_points.js'

const step = (instruction = 'Continue on the road') => ({
  instruction,
  distanceMeters: 120,
  durationSeconds: 40,
})
const route = (pointCount = 4): OfflineRouteResult => ({
  regionName: 'Brazil',
  packageId: 'regions:brazil',
  packageVersion: '2026-source',
  profile: 'pedestrian',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-46.63, -23.55],
      [-46.64, -23.56],
    ],
  },
  distanceMeters: (pointCount - 1) * 120,
  durationSeconds: (pointCount - 1) * 40,
  maneuvers: Array.from({ length: pointCount - 1 }, () => step()),
  legs: Array.from({ length: pointCount - 1 }, (_, index) => ({
    fromIndex: index,
    toIndex: index + 1,
    distanceMeters: 120,
    durationSeconds: 40,
    maneuvers: [step()],
  })),
})

test('linked vias retain canonical order and the last point remains destination', () => {
  const stops = createRouteStops('1,2', '7,8', ['3,4', '5,6'])
  assert.deepEqual(
    stops.map((stop) => stop.value),
    ['1,2', '3,4', '5,6', '7,8']
  )
  assert.deepEqual(
    stops.map((_, index) => routePointLabel(index, stops.length)),
    ['A · Origin', 'B · Stop 1', 'C · Stop 2', 'D · Destination']
  )
  assert.deepEqual(parsedRouteStops(stops), [
    { lat: 1, lon: 2 },
    { lat: 3, lon: 4 },
    { lat: 5, lon: 6 },
    { lat: 7, lon: 8 },
  ])
})

test('reordering moves complete cards and preserves IDs used by active selection', () => {
  const stops = createRouteStops('1,2', '7,8', ['3,4', '5,6'])
  const activeId = stops[1].id
  const reordered = moveRouteStop(stops, 1, 3)
  assert.deepEqual(
    reordered.map((stop) => stop.value),
    ['1,2', '5,6', '7,8', '3,4']
  )
  assert.equal(reordered[3].id, activeId)
  assert.equal(
    routePointLabel(
      reordered.findIndex((stop) => stop.id === activeId),
      reordered.length
    ),
    'D · Destination'
  )
  assert.equal(stops[1].value, '3,4')
  assert.equal(moveRouteStop(stops, -1, 3), stops)
  assert.equal(moveRouteStop(stops, 0, 4), stops)
  assert.equal(moveRouteStop(stops, 1.5, 2), stops)
})

test('invalid coordinates anywhere in the itinerary remain invalid after reorder', () => {
  const stops = createRouteStops('1,2', '7,8', ['91,4'])
  assert.equal(parsedRouteStops(stops)[1], null)
  assert.equal(parsedRouteStops(moveRouteStop(stops, 1, 0))[0], null)
})

test('route responses must contain exactly one valid consecutive leg per stop pair', () => {
  assert.equal(isOfflineRouteResult(route(), 4, 'pedestrian'), true)
  assert.equal(isOfflineRouteResult(route(2), 2, 'pedestrian'), true)
  assert.equal(isOfflineRouteResult(route(), 3, 'pedestrian'), false)
  assert.equal(isOfflineRouteResult(route(), 4, 'auto'), false)
  const missing = route()
  missing.legs.pop()
  assert.equal(isOfflineRouteResult(missing, 4, 'pedestrian'), false)
  const reordered = route()
  reordered.legs.reverse()
  assert.equal(isOfflineRouteResult(reordered, 4, 'pedestrian'), false)
  const wrongIndex = route()
  wrongIndex.legs[1].toIndex = 3
  assert.equal(isOfflineRouteResult(wrongIndex, 4, 'pedestrian'), false)
})

test('invalid leg data and unsafe geometry never become displayed instructions', () => {
  for (const value of [NaN, Infinity, -1]) {
    const invalid = route()
    invalid.legs[1].durationSeconds = value
    assert.equal(isOfflineRouteResult(invalid, 4, 'pedestrian'), false)
  }
  const invalid = route()
  invalid.legs[2].maneuvers[0].distanceMeters = -100
  assert.equal(isOfflineRouteResult(invalid, 4, 'pedestrian'), false)
  const badGeometry = route()
  badGeometry.geometry.coordinates[0][0] = 181
  assert.equal(isOfflineRouteResult(badGeometry, 4, 'pedestrian'), false)
})

test('plain text export includes every leg and instructions beyond screen pagination', () => {
  const result = route()
  result.legs[0].maneuvers = Array.from({ length: 25 }, (_, index) =>
    step(`Instruction ${index + 1} with <plain text>`)
  )
  result.legs[2].maneuvers = [step('Arrive at the final destination')]
  const text = routeInstructionsText(result, createRouteStops('1,2', '7,8', ['3,4', '5,6']))
  assert.match(text, /Dataset: regions:brazil \/ 2026-source/)
  assert.match(text, /A · Origin: 1,2/)
  assert.match(text, /D · Destination: 7,8/)
  assert.match(text, /LEG 1: A · Origin → B · Stop 1/)
  assert.match(text, /LEG 3: C · Stop 2 → D · Destination/)
  assert.match(text, /25\. Instruction 25 with <plain text>/)
  assert.match(text, /Arrive at the final destination/)
  assert.match(text, /temporary road closures are unavailable offline/)
})

test('seven cards preserve stable identities, final G destination and all six exported legs', () => {
  const stops = createRouteStops('0,0', '6,6', ['1,1', '2,2', '3,3', '4,4', '5,5'])
  assert.equal(stops.length, 7)
  assert.equal(routePointLabel(6, stops.length), 'G · Destination')
  assert.equal(routePointLabel(5, stops.length), 'F · Stop 5')
  const activeId = stops[1].id
  const moved = moveRouteStop(stops, 1, 6)
  assert.equal(moved[6].id, activeId)
  assert.equal(stops[1].value, '1,1')
  assert.equal(isOfflineRouteResult(route(7), 7, 'pedestrian'), true)
  assert.equal(isOfflineRouteResult(route(8), 8, 'pedestrian'), false)
  const text = routeInstructionsText(route(7), stops)
  assert.match(text, /G · Destination: 6,6/)
  assert.match(text, /LEG 6: F · Stop 5 → G · Destination/)
  assert.equal((text.match(/LEG [1-6]:/g) || []).length, 6)
})
