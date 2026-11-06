import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatSpeed } from '../../app/utils/misc.js'

test('formatSpeed picks the unit after rounding', async (t) => {
  // 1023.6 rounds up to 1024 bytes -> shown as the next unit.
  assert.equal(formatSpeed(1023.6), '1.0 KB/s')
  assert.equal(formatSpeed(1023.4), '1023 B/s')

  // A speed just under 1 MiB rounds to 1.0 MB/s, not "1024.0 KB/s".
  assert.equal(formatSpeed(1024 * 1024 - 1), '1.0 MB/s')
  assert.equal(formatSpeed(1024 * 1023.5), '1023.5 KB/s')

  assert.equal(formatSpeed(1024 * 1024 * 2.5), '2.5 MB/s')

  // Non-positive speeds stay guarded.
  assert.equal(formatSpeed(0), '0 B/s')
  assert.equal(formatSpeed(-5), '0 B/s')
})
