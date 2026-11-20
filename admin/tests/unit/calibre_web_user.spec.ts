import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveCalibreWebUidGid } from '../../app/utils/calibre_web_user.js'

test('resolveCalibreWebUidGid defaults to 1000:1000', () => {
  assert.deepEqual(resolveCalibreWebUidGid(undefined, {}), { uid: 1000, gid: 1000 })
})

test('resolveCalibreWebUidGid prefers service env entries over process.env', () => {
  assert.deepEqual(
    resolveCalibreWebUidGid(['PUID=99', 'PGID=100'], { PUID: '1001', PGID: '1001' }),
    { uid: 99, gid: 100 }
  )
})

test('resolveCalibreWebUidGid falls back to process.env and ignores invalid values', () => {
  assert.deepEqual(resolveCalibreWebUidGid([], { PUID: '99', PGID: '100' }), { uid: 99, gid: 100 })
  assert.deepEqual(resolveCalibreWebUidGid(['PUID=abc', 'PGID=-5'], {}), { uid: 1000, gid: 1000 })
})
