import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildBooleanQuery,
  dedupeKey,
  foldText,
  matchesAllWords,
  placeImportance,
  queryWords,
  rankPlaces,
  representativePoint,
  tilePointToLngLat,
  toIndexedPlace,
  type PlaceCandidate,
} from '../../app/utils/map_place_search.js'

test('foldText strips diacritics, special letters and punctuation', () => {
  assert.equal(foldText('Baščaršija'), 'bascarsija')
  assert.equal(foldText('Đurđevik'), 'durdevik')
  assert.equal(foldText('Džidžikovac'), 'dzidzikovac')
  assert.equal(foldText('Ulica Maršala Tita 2a'), 'ulica marsala tita 2a')
  assert.equal(foldText('Straße  am Øresund'), 'strasse am oresund')
  assert.equal(foldText('Sv. Ante'), 'sv ante')
  assert.equal(foldText('Београд'), 'београд')
})

test('buildBooleanQuery keeps usable words and prefix-matches the one being typed', () => {
  assert.equal(buildBooleanQuery(queryWords('Stari mo')), '+stari* +mo*')
  // short words before the last can't be FULLTEXT-matched; enforced later instead
  assert.equal(buildBooleanQuery(queryWords('sv ante')), '+ante*')
  assert.equal(buildBooleanQuery(queryWords('museum of sar'), new Set(['of'])), '+museum* +sar*')
  assert.equal(buildBooleanQuery(queryWords('t')), null)
  assert.equal(buildBooleanQuery([]), null)
})

test('matchesAllWords requires every word to start a word of the place', () => {
  assert.equal(matchesAllWords('stari most old bridge', ['old', 'bri']), true)
  assert.equal(matchesAllWords('sv ante', ['sv', 'ante']), true)
  assert.equal(matchesAllWords('mostar', ['star']), false)
})

test('placeImportance orders cities > towns > villages > landmarks > shops > streets', () => {
  const city = placeImportance('places', 'locality', 'city')
  const town = placeImportance('places', 'locality', 'town')
  const village = placeImportance('places', 'locality', 'village')
  const hospital = placeImportance('pois', 'hospital', null)
  const shop = placeImportance('pois', 'supermarket', null)
  const street = placeImportance('roads', 'minor_road', 'residential')
  assert.ok(city > town && town > village && village > hospital && hospital > shop && shop > street)
  // stops and taxi ranks named after a place rank below it and below ordinary POIs
  assert.ok(placeImportance('pois', 'tram_stop', null) < shop)
  assert.ok(placeImportance('pois', 'taxi', null) < street)
})

test('tilePointToLngLat inverts web-mercator tile coordinates', () => {
  // Top-left corner of the world at z0, and the centre.
  assert.deepEqual(
    tilePointToLngLat(0, 0, 0, 0, 0, 4096).map((v) => Math.round(v)),
    [-180, 85]
  )
  const [lng, lat] = tilePointToLngLat(0, 0, 0, 2048, 2048, 4096)
  assert.ok(Math.abs(lng) < 1e-9 && Math.abs(lat) < 1e-9)
  // Sarajevo: tile 14/9029/5966 contains 43.856, 18.413
  const [sLng, sLat] = tilePointToLngLat(14, 9029, 5966, 2048, 2048, 4096)
  assert.ok(Math.abs(sLng - 18.413) < 0.02 && Math.abs(sLat - 43.856) < 0.02)
})

test('representativePoint: point, middle of the longest line, centre of an area', () => {
  assert.deepEqual(representativePoint(1, [[{ x: 5, y: 6 }]]), { x: 5, y: 6 })
  assert.deepEqual(
    representativePoint(2, [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
    ]),
    { x: 10, y: 0 }
  )
  assert.deepEqual(
    representativePoint(3, [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 4 },
        { x: 0, y: 4 },
      ],
    ]),
    { x: 5, y: 2 }
  )
  assert.equal(representativePoint(1, [[]]), null)
})

test('toIndexedPlace keeps useful fields and folds the search text', () => {
  const place = toIndexedPlace(
    'places',
    { 'name': 'Beograd', 'name:en': 'Belgrade', 'kind': 'locality', 'kind_detail': 'city' },
    [20.46, 44.81]
  )
  assert.deepEqual(place, {
    name: 'Beograd',
    nameEn: 'Belgrade',
    layer: 'places',
    kind: 'city',
    importance: 100,
    lat: 44.81,
    lng: 20.46,
    searchText: 'beograd belgrade',
  })
  // English name identical after folding is not stored twice
  assert.equal(
    toIndexedPlace('places', { 'name': 'Tuzla', 'name:en': 'Tuzla', 'kind': 'locality' }, [0, 0])
      ?.nameEn,
    null
  )
  assert.equal(toIndexedPlace('pois', { kind: 'bench' }, [0, 0]), null)
})

test('dedupeKey merges tile-buffer copies but keeps far-apart namesakes', () => {
  const at = (lat: number, lng: number) =>
    toIndexedPlace('roads', { name: 'Ulica Maršala Tita', kind: 'major_road' }, [lng, lat])!
  assert.equal(dedupeKey(at(43.8561, 18.4131), false), dedupeKey(at(43.8562, 18.4133), false))
  assert.notEqual(dedupeKey(at(43.856, 18.413), false), dedupeKey(at(44.53, 18.67), false))
})

function candidate(overrides: Partial<PlaceCandidate>): PlaceCandidate {
  const base = {
    name: 'X',
    nameEn: null,
    layer: 'places',
    kind: 'village',
    importance: 65,
    lat: 0,
    lng: 0,
    file: 'ba.pmtiles',
  }
  const merged = { ...base, ...overrides }
  return {
    ...merged,
    searchText: foldText(merged.nameEn ? `${merged.name} ${merged.nameEn}` : merged.name),
  }
}

test('rankPlaces: accent-insensitive, importance first, then distance', () => {
  const near = { lat: 43.856, lng: 18.413 } // Sarajevo
  const results = rankPlaces(
    [
      candidate({
        name: 'Mostarska',
        layer: 'roads',
        kind: 'minor_road',
        importance: 25,
        lat: 43.85,
        lng: 18.41,
      }),
      candidate({ name: 'Mostar', kind: 'city', importance: 100, lat: 43.343, lng: 17.808 }),
      candidate({
        name: 'Stari most',
        nameEn: 'Old Bridge',
        layer: 'pois',
        kind: 'attraction',
        importance: 55,
        lat: 43.337,
        lng: 17.815,
      }),
      candidate({ name: 'Mostar', kind: 'village', importance: 65, lat: 45.0, lng: 19.5 }),
    ],
    'most',
    near
  )
  const order = results.map((r) => `${r.name}/${r.kind}`)
  assert.equal(order.length, 4)
  // The city wins on importance despite being 76 km away …
  assert.equal(order[0], 'Mostar/city')
  // … and distance still counts: the street around the corner beats a namesake village 150 km off.
  assert.ok(order.indexOf('Mostarska/minor_road') < order.indexOf('Mostar/village'))

  const accent = rankPlaces(
    [candidate({ name: 'Baščaršija', kind: 'neighbourhood' })],
    'bascarsija',
    null
  )
  assert.equal(accent[0]?.name, 'Baščaršija')

  const english = rankPlaces(
    [candidate({ name: 'Stari most', nameEn: 'Old Bridge' })],
    'old bri',
    null
  )
  assert.equal(english.length, 1)
})

test('rankPlaces merges pieces of the same street and respects the limit', () => {
  const pieces = [0, 0.01, 0.02].map((d) =>
    candidate({
      name: 'Zmaja od Bosne',
      layer: 'roads',
      kind: 'major_road',
      importance: 35,
      lat: 43.85,
      lng: 18.38 + d,
    })
  )
  assert.equal(rankPlaces(pieces, 'zmaja', null).length, 1)

  const many = Array.from({ length: 30 }, (_, i) =>
    candidate({ name: `Selo ${i}`, lat: i, lng: i })
  )
  assert.equal(rankPlaces(many, 'selo', null, 10).length, 10)
  assert.equal(rankPlaces(many, '  ', null).length, 0)
})

test('rankPlaces breaks ties by the closest name, then distance', () => {
  const near = { lat: 43.856, lng: 18.413 } // far from all of them: capped penalty, equal scores
  const results = rankPlaces(
    [
      candidate({
        name: 'Times Square Building',
        layer: 'pois',
        kind: 'attraction',
        importance: 55,
        lat: 43.15,
        lng: -77.61,
      }),
      candidate({
        name: 'Times Square',
        layer: 'pois',
        kind: 'attraction',
        importance: 55,
        lat: 40.758,
        lng: -73.985,
      }),
    ],
    'times sq',
    near
  )
  assert.equal(results[0].name, 'Times Square')
})
