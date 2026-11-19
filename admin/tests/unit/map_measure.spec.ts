import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatArea,
  formatDistance,
  haversineMeters,
  pathLengthMeters,
  polygonAreaSqMeters,
  segmentLengthsMeters,
  type LngLat,
} from '../../inertia/lib/map_measure.js'

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )

test('haversineMeters: one degree of latitude and a real city pair', () => {
  near(haversineMeters([0, 0], [0, 1]), 111_319.49, 0.1)
  // Sarajevo -> Mostar, ~76 km as the crow flies
  near(haversineMeters([18.4131, 43.8563], [17.8078, 43.3438]), 76_000, 2_000)
  assert.equal(haversineMeters([18.4, 43.8], [18.4, 43.8]), 0)
})

test('haversineMeters takes the short way across the antimeridian', () => {
  near(haversineMeters([179.5, 0], [-179.5, 0]), 111_319.49, 0.1)
})

test('segment and path lengths, open and closed', () => {
  const square: LngLat[] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ]
  const segments = segmentLengthsMeters(square)
  assert.equal(segments.length, 3)
  near(pathLengthMeters(square), segments[0] + segments[1] + segments[2], 1e-6)
  near(
    pathLengthMeters(square, true) - pathLengthMeters(square),
    haversineMeters([1, 0], [0, 0]),
    1e-6
  )
  assert.equal(pathLengthMeters([[5, 5]]), 0)
})

test('polygonAreaSqMeters: a 1x1 degree square at the equator, either orientation', () => {
  const square: LngLat[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
  // Exact on the sphere: R² · Δλ · (sin φ2 − sin φ1)
  const R = 6378137
  const exact = R * R * (Math.PI / 180) * Math.sin(Math.PI / 180)
  near(polygonAreaSqMeters(square), exact, 1)
  near(polygonAreaSqMeters([...square].reverse()), polygonAreaSqMeters(square), 1e-3)
  assert.equal(polygonAreaSqMeters(square.slice(0, 2)), 0)
})

test('formatDistance follows the map scale unit', () => {
  assert.equal(formatDistance(850, 'metric'), '850 m')
  assert.equal(formatDistance(12_345, 'metric'), '12.35 km')
  assert.equal(formatDistance(1_234_567, 'metric'), '1,234.6 km')
  assert.equal(formatDistance(100, 'imperial'), '328 ft')
  assert.equal(formatDistance(5_000, 'imperial'), '3.11 mi')
  assert.equal(formatDistance(1_852, 'nautical'), '1.00 nm')
})

test('formatArea picks a readable magnitude', () => {
  assert.equal(formatArea(640, 'metric'), '640 m²')
  assert.equal(formatArea(32_000, 'metric'), '3.20 ha')
  assert.equal(formatArea(45_100_000, 'metric'), '45.10 km²')
  assert.equal(formatArea(10_117.14, 'imperial'), '2.50 acres')
  assert.equal(formatArea(5_179_976, 'imperial'), '2.00 mi²')
  assert.equal(formatArea(3_429_904, 'nautical'), '1.00 nm²')
})
