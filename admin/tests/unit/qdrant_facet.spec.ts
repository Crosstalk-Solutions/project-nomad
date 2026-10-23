import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { facetHitsWithPoints } from '../../app/utils/qdrant_facet.js'

test('a value whose points were all deleted (count 0) is not a source any more', () => {
  // Observed on Qdrant 1.16 with exact: true, seconds after a delete by source
  // filter: the value is still listed, with count 0.
  assert.deepEqual(
    facetHitsWithPoints([
      { value: '/app/storage/zim/medlineplus.zim', count: 76115 },
      { value: '/app/storage/zim/fas-military-medicine.zim', count: 0 },
      { value: '/app/storage/zim/nhs.zim', count: 10386 },
    ]),
    [
      { value: '/app/storage/zim/medlineplus.zim', count: 76115 },
      { value: '/app/storage/zim/nhs.zim', count: 10386 },
    ]
  )
})

test('non-string values are skipped', () => {
  assert.deepEqual(
    facetHitsWithPoints([
      { value: 42, count: 3 },
      { value: null, count: 1 },
    ]),
    []
  )
  assert.deepEqual(facetHitsWithPoints([]), [])
})
