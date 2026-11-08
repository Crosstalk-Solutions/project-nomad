import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { labelMapRegions } from '../../app/utils/map_region_label.js'

const lookups = {
  countries: { BA: 'Bosnia and Herzegovina', FJ: 'Fiji', HR: 'Croatia' },
  groups: { europe: 'Europe' },
  // Titles as they appear in collections/maps.json, underscores included.
  curated: { new_york: 'New_York', new_jersey: 'New_Jersey', alaska: 'Alaska' },
}

test('labels a single-country extract with the country name', () => {
  assert.deepEqual(labelMapRegions(['ba_20261107_z15.pmtiles'], lookups), [
    { file: 'ba_20261107_z15.pmtiles', label: 'Bosnia and Herzegovina' },
  ])
})

test('labels a country-group extract with the group name', () => {
  assert.deepEqual(labelMapRegions(['europe_20261107_z12.pmtiles'], lookups), [
    { file: 'europe_20261107_z12.pmtiles', label: 'Europe' },
  ])
})

test('labels curated packs with the manifest title, preferring the longest matching id', () => {
  assert.deepEqual(
    labelMapRegions(['new_york_2025-12.pmtiles', 'new_jersey_2025-12.pmtiles'], {
      ...lookups,
      curated: { ...lookups.curated, new: 'Not this one' },
    }),
    [
      { file: 'new_jersey_2025-12.pmtiles', label: 'New Jersey' },
      { file: 'new_york_2025-12.pmtiles', label: 'New York' },
    ]
  )
})

test('labels the full planet build as the whole world', () => {
  assert.deepEqual(labelMapRegions(['20261107.pmtiles'], lookups), [
    { file: '20261107.pmtiles', label: 'Whole world' },
  ])
})

test('adds the zoom level when one country is extracted at two zoom levels', () => {
  assert.deepEqual(
    labelMapRegions(['ba_20261107_z15.pmtiles', 'ba_20261107_z10.pmtiles'], lookups),
    [
      { file: 'ba_20261107_z10.pmtiles', label: 'Bosnia and Herzegovina (zoom 10)' },
      { file: 'ba_20261107_z15.pmtiles', label: 'Bosnia and Herzegovina (zoom 15)' },
    ]
  )
})

test('falls back to the filename when name and zoom both collide', () => {
  assert.deepEqual(
    labelMapRegions(['ba_20261107_z15.pmtiles', 'ba_20261001_z15.pmtiles'], lookups),
    [
      { file: 'ba_20261001_z15.pmtiles', label: 'Bosnia and Herzegovina (ba_20261001_z15)' },
      { file: 'ba_20261107_z15.pmtiles', label: 'Bosnia and Herzegovina (ba_20261107_z15)' },
    ]
  )
})

test('keeps custom multi-country regions apart', () => {
  assert.deepEqual(
    labelMapRegions(
      ['custom-1a2b3c4d_20261107_z14.pmtiles', 'custom-9f8e7d6c_20261107_z14.pmtiles'],
      lookups
    ),
    [
      { file: 'custom-1a2b3c4d_20261107_z14.pmtiles', label: 'Custom region (1a2b3c4d)' },
      { file: 'custom-9f8e7d6c_20261107_z14.pmtiles', label: 'Custom region (9f8e7d6c)' },
    ]
  )
})

test('humanizes files it does not recognise, and survives empty lookups', () => {
  assert.deepEqual(
    labelMapRegions(['my_hand-made_map.pmtiles', 'ba_20261107_z15.pmtiles'], {
      countries: {},
      groups: {},
      curated: {},
    }),
    [
      { file: 'ba_20261107_z15.pmtiles', label: 'Ba 20261107 Z15' },
      { file: 'my_hand-made_map.pmtiles', label: 'My Hand Made Map' },
    ]
  )
})
