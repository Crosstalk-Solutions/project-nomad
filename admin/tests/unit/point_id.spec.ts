import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { chunkPointId, uuidV5 } from '../../app/utils/point_id.js'

test('matches the RFC 4122 UUIDv5 reference value', () => {
  // DNS namespace + "www.example.com", the widely published test vector
  assert.equal(
    uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    '2ed6657d-e927-568b-95e1-2665a8aea6a2'
  )
})

test('chunk ids are stable across calls and distinct per chunk and seed', () => {
  const seed = '/storage/zim/wiki.zim\u0000A/Water\u00002'
  assert.equal(chunkPointId(seed, 0), chunkPointId(seed, 0))
  assert.notEqual(chunkPointId(seed, 0), chunkPointId(seed, 1))
  assert.notEqual(chunkPointId(seed, 0), chunkPointId('/storage/zim/wiki.zim\u0000A/Water\u00003', 0))
  assert.match(chunkPointId(seed, 0), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
