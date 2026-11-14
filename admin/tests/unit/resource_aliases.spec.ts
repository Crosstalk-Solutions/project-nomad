import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildPreviousIdMap,
  currentResourceId,
  filenameBelongsToResource,
  previousIdsFor,
} from '../../app/utils/resource_aliases.js'

// Renamed curated resources (#1171): openZIM renamed fas-military-medicine_en to
// irp.fas.org_en_military-medicine, so installs holding the old file must map it
// to the new id instead of re-downloading it.

function spec(resources: Array<{ id: string; previous_ids?: string[] }>) {
  return {
    spec_version: '1.0.0',
    categories: [
      {
        name: 'Medicine',
        slug: 'medicine',
        icon: 'IconMedicalCross',
        description: '',
        language: 'en',
        tiers: [
          {
            name: 'Comprehensive',
            slug: 'comprehensive',
            description: '',
            resources: resources.map((r) => ({
              title: r.id,
              description: '',
              version: '2026-10',
              url: `https://example.org/${r.id}_2026-10.zim`,
              size_mb: 1,
              ...r,
            })),
          },
        ],
      },
    ],
  } as any
}

test('maps a former id to the current id', () => {
  const map = buildPreviousIdMap(
    spec([{ id: 'irp.fas.org_en_military-medicine', previous_ids: ['fas-military-medicine_en'] }])
  )
  assert.equal(currentResourceId('fas-military-medicine_en', map), 'irp.fas.org_en_military-medicine')
  assert.deepEqual(previousIdsFor('irp.fas.org_en_military-medicine', map), ['fas-military-medicine_en'])
})

test('leaves ids that were never renamed unchanged', () => {
  const map = buildPreviousIdMap(spec([{ id: 'zimgit-water_en' }]))
  assert.equal(map.size, 0)
  assert.equal(currentResourceId('zimgit-water_en', map), 'zimgit-water_en')
  assert.deepEqual(previousIdsFor('zimgit-water_en', map), [])
})

test('never reroutes an id that is still some resource’s current id', () => {
  // A typo listing a live id as a former id must not hijack that resource.
  const map = buildPreviousIdMap(
    spec([{ id: 'new_en', previous_ids: ['live_en', 'new_en'] }, { id: 'live_en' }])
  )
  assert.equal(currentResourceId('live_en', map), 'live_en')
  assert.equal(currentResourceId('new_en', map), 'new_en')
})

test('handles a missing or empty spec', () => {
  assert.equal(buildPreviousIdMap(null).size, 0)
  assert.equal(buildPreviousIdMap(undefined).size, 0)
  assert.equal(buildPreviousIdMap({ spec_version: '1', categories: [] }).size, 0)
})

test('filenameBelongsToResource matches dated builds of the given ids only', () => {
  const ids = ['irp.fas.org_en_military-medicine', 'fas-military-medicine_en']
  assert.ok(filenameBelongsToResource('fas-military-medicine_en_2025-06.zim', ids))
  assert.ok(filenameBelongsToResource('irp.fas.org_en_military-medicine_2026-05.zim', ids))
  // A different resource that merely shares a prefix must not match.
  assert.ok(!filenameBelongsToResource('fas-military-medicine_en.zim', ids))
  assert.ok(!filenameBelongsToResource('fas_all_2026-01.zim', ids))
  assert.ok(!filenameBelongsToResource('anything_2026-01.zim', []))
  assert.ok(!filenameBelongsToResource('_2026-01.zim', ['']))
})
