import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkDownloadedSize,
  isMatchingResume,
  parseContentRange,
} from '../../app/utils/download_integrity.js'

test('parseContentRange reads start, end and total', () => {
  assert.deepEqual(parseContentRange('bytes 1000-1999/2000'), { start: 1000, end: 1999, total: 2000 })
  assert.deepEqual(parseContentRange('bytes 0-9/*'), { start: 0, end: 9, total: null })
  assert.equal(parseContentRange(undefined), null)
  assert.equal(parseContentRange('garbage'), null)
})

test('a resume is accepted only when it continues our partial file', () => {
  assert.equal(isMatchingResume('bytes 1000-1999/2000', 1000, 2000), true)
  // another mirror / a replaced file answered with a different range or size
  assert.equal(isMatchingResume('bytes 0-1999/2000', 1000, 2000), false)
  assert.equal(isMatchingResume('bytes 1000-2999/3000', 1000, 2000), false)
  // no Content-Range on a 206 cannot be trusted
  assert.equal(isMatchingResume(undefined, 1000, 2000), false)
})

test('a short or oversized stream is not complete; unknown size cannot be checked', () => {
  assert.equal(checkDownloadedSize(2000, 2000), 'complete')
  assert.equal(checkDownloadedSize(1500, 2000), 'short')
  assert.equal(checkDownloadedSize(2500, 2000), 'oversized')
  assert.equal(checkDownloadedSize(1234, 0), 'complete')
})

test('a download needs the rest of the file plus headroom free', async () => {
  const { hasRoomForDownload } = await import('../../app/utils/download_integrity.js')
  const GiB = 1024 ** 3
  assert.equal(hasRoomForDownload(100 * GiB, 60 * GiB), false) // 100 GB Wikipedia, 60 GB free
  assert.equal(hasRoomForDownload(10 * GiB, 11 * GiB), false) // fits, but leaves < 2 GiB
  assert.equal(hasRoomForDownload(10 * GiB, 12 * GiB), true)
  assert.equal(hasRoomForDownload(10 * GiB, 10.5 * GiB, 0), true)
})
