import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  describePlace,
  formatLatLng,
  humanizeKind,
  pickPlace,
} from '../../inertia/lib/map_place_info.js'

test('humanizeKind turns tile kinds into words', () => {
  assert.equal(humanizeKind('bus_stop'), 'Bus stop')
  assert.equal(humanizeKind('supermarket'), 'Supermarket')
})

test('describePlace: a point of interest with its own point', () => {
  assert.deepEqual(
    describePlace({
      sourceLayer: 'pois',
      properties: { name: 'Konzum', kind: 'supermarket', min_zoom: 15 },
      point: [18.4, 43.85],
    }),
    {
      name: 'Konzum',
      englishName: null,
      type: 'Supermarket',
      elevation: null,
      point: [18.4, 43.85],
    }
  )
})

test('describePlace: settlements use their size, neighbourhoods their detail', () => {
  assert.equal(
    describePlace({
      sourceLayer: 'places',
      properties: { name: 'Mostar', kind: 'locality', kind_detail: 'town' },
    })?.type,
    'Town'
  )
  assert.equal(
    describePlace({
      sourceLayer: 'places',
      properties: { name: 'Ciglane', kind: 'neighbourhood', kind_detail: 'suburb' },
    })?.type,
    'Suburb'
  )
  assert.equal(
    describePlace({ sourceLayer: 'places', properties: { name: 'Gorica', kind: 'macrohood' } })
      ?.type,
    'District'
  )
})

test('describePlace: roads, water, English names and elevation', () => {
  assert.equal(
    describePlace({
      sourceLayer: 'roads',
      properties: { name: 'Bolnička', kind: 'minor_road', kind_detail: 'residential' },
    })?.type,
    'Street'
  )
  assert.equal(
    describePlace({ sourceLayer: 'water', properties: { name: 'Miljacka', kind: 'river' } })?.type,
    'River'
  )

  const square = describePlace({
    sourceLayer: 'water',
    properties: {
      'name': 'Trg Bosne i Hercegovine',
      'name:en': 'Square of Bosnia and Herzegovina',
      'kind': 'fountain',
    },
  })
  assert.equal(square?.englishName, 'Square of Bosnia and Herzegovina')

  const same = describePlace({
    sourceLayer: 'places',
    properties: {
      'name': 'Sarajevo',
      'name:en': 'sarajevo',
      'kind': 'locality',
      'kind_detail': 'city',
    },
  })
  assert.equal(same?.englishName, null)

  assert.equal(
    describePlace({
      sourceLayer: 'pois',
      properties: { name: 'Bjelašnica', kind: 'peak', elevation: 2067.4 },
    })?.elevation,
    2067
  )
})

test('describePlace ignores unnamed features', () => {
  assert.equal(describePlace({ sourceLayer: 'pois', properties: { kind: 'bench' } }), null)
  assert.equal(describePlace({ sourceLayer: 'roads', properties: { name: '  ' } }), null)
  assert.equal(describePlace({ sourceLayer: 'pois', properties: null }), null)
})

test('pickPlace prefers a point of interest over the street label next to it', () => {
  const place = pickPlace([
    { sourceLayer: 'roads', properties: { name: 'Maršala Tita', kind: 'major_road' } },
    { sourceLayer: 'pois', properties: { kind: 'bench' } },
    { sourceLayer: 'pois', properties: { name: 'Vječna vatra', kind: 'memorial' } },
  ])
  assert.equal(place?.name, 'Vječna vatra')
  assert.equal(pickPlace([{ sourceLayer: 'landuse', properties: { name: 'x' } }]), null)
  assert.equal(pickPlace([]), null)
})

test('formatLatLng matches the coordinate box format', () => {
  assert.equal(formatLatLng(43.8563, 18.4131), '43.856300, 18.413100')
})
