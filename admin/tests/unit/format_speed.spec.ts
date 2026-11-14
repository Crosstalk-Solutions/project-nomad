import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatSpeed } from '../../app/utils/misc.js'

test('formatSpeed: speeds inside a unit read in that unit', () => {
  assert.equal(formatSpeed(512), '512 B/s')
  assert.equal(formatSpeed(1536), '1.5 KB/s')
  assert.equal(formatSpeed(5 * 1024 * 1024), '5.0 MB/s')
})

test('formatSpeed: a speed that rounds up to 1024 reads in the next unit', () => {
  assert.equal(formatSpeed(1023.6), '1.0 KB/s')
  assert.equal(formatSpeed(1024 * 1024 - 1), '1.0 MB/s')
  assert.equal(formatSpeed(1024 * 1023.96), '1.0 MB/s')
})

test('formatSpeed: no speed, or a bad one, reads as 0 B/s', () => {
  assert.equal(formatSpeed(0), '0 B/s')
  assert.equal(formatSpeed(-5), '0 B/s')
  assert.equal(formatSpeed(Number.NaN), '0 B/s')
})
