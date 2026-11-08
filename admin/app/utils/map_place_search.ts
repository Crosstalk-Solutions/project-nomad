/**
 * Pure helpers for offline place search: text folding, which features get indexed and how
 * important they are, and how query results are matched and ranked. No database or file
 * access here so all of it can be unit tested.
 *
 * Feature properties follow the Protomaps basemap tiles NOMAD serves (`name`, `name:en`,
 * `kind`, `kind_detail`, `population`).
 */

/** Letters NFKD does not decompose into a base letter + mark. */
const SPECIAL_LETTERS: Record<string, string> = {
  đ: 'd',
  ð: 'd',
  ł: 'l',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
  ı: 'i',
  ħ: 'h',
  ŧ: 't',
}

/**
 * Lowercase, strip diacritics and punctuation: "Baščaršija" -> "bascarsija",
 * "Đurđevik" -> "durdevik", "Ulica Maršala Tita 2a" -> "ulica marsala tita 2a".
 * Non-Latin scripts are kept (lowercased), so Cyrillic names still match Cyrillic queries.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[đðłøæœßþıħŧ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Words of a folded query, in order. */
export function queryWords(query: string): string[] {
  return foldText(query).split(' ').filter(Boolean)
}

/**
 * MySQL boolean-mode FULLTEXT query for the candidate lookup, or null when no word is usable.
 * InnoDB doesn't index tokens shorter than 3 characters (innodb_ft_min_token_size) and drops
 * stopwords, so such words would make a required term unmatchable. They are left out here and
 * enforced afterwards by matchesAllWords. The last word is the one being typed, so it is a
 * prefix search even when short.
 */
export function buildBooleanQuery(
  words: string[],
  stopwords: ReadonlySet<string> = new Set()
): string | null {
  const terms = words
    .map((word, i) => {
      const isLast = i === words.length - 1
      if (stopwords.has(word)) return null
      if (!isLast && word.length < 3) return null
      if (isLast && word.length < 2) return null
      return `+${word}*`
    })
    .filter((term): term is string => term !== null)
  return terms.length > 0 ? terms.join(' ') : null
}

/** Every query word starts some word of the (folded) place text. */
export function matchesAllWords(foldedText: string, words: string[]): boolean {
  const textWords = foldedText.split(' ')
  return words.every((word) => textWords.some((t) => t.startsWith(word)))
}

// ---------------------------------------------------------------------------------------------
// Indexing

export type IndexLayer = 'places' | 'pois' | 'water' | 'roads' | 'earth'
export const INDEXED_LAYERS: readonly IndexLayer[] = ['places', 'pois', 'water', 'roads', 'earth']

const POI_LANDMARK_KINDS = new Set([
  'aerodrome',
  'airport',
  'attraction',
  'bus_station',
  'castle',
  'college',
  'ferry_terminal',
  'hospital',
  'museum',
  'national_park',
  'peak',
  'stadium',
  'station',
  'train_station',
  'university',
  'volcano',
  'zoo',
])

/**
 * Points that usually borrow the name of the place they serve (the "Baščaršija" tram stop,
 * taxi rank and bus stop next to Baščaršija) or are administrative areas; ranked below other
 * POIs so they don't crowd out the place itself.
 */
const POI_SECONDARY_KINDS = new Set([
  'administrative',
  'bus_stop',
  'charging_station',
  'parking',
  'platform',
  'stop_position',
  'taxi',
  'tram_stop',
])

/**
 * How prominent a feature is (0-100), used to rank results: a city beats a village of the
 * same name, which beats a shop, which beats a street.
 */
export function placeImportance(
  layer: IndexLayer,
  kind: string | null,
  detail: string | null
): number {
  switch (layer) {
    case 'places':
      if (kind === 'country') return 95
      if (kind === 'region') return 90
      if (kind === 'locality') {
        if (detail === 'city') return 100
        if (detail === 'town') return 85
        if (detail === 'village') return 65
        if (detail === 'hamlet' || detail === 'isolated_dwelling') return 50
        return 60
      }
      if (kind === 'macrohood') return 60
      return 52 // neighbourhoods, suburbs, quarters
    case 'pois':
      if (kind && POI_LANDMARK_KINDS.has(kind)) return 55
      if (kind && POI_SECONDARY_KINDS.has(kind)) return 22
      return 40
    case 'water':
      if (
        kind === 'lake' ||
        kind === 'reservoir' ||
        kind === 'river' ||
        kind === 'sea' ||
        kind === 'bay'
      )
        return 50
      if (kind === 'stream' || kind === 'canal') return 35
      return 30
    case 'roads':
      if (kind === 'highway') return 40
      if (kind === 'major_road') return 35
      if (kind === 'minor_road') return 25
      return 15
    case 'earth':
      return 45 // islands, peninsulas, …
  }
}

/** [lng, lat] of a point given in tile-local units (0..extent) of tile z/x/y. */
export function tilePointToLngLat(
  z: number,
  x: number,
  y: number,
  px: number,
  py: number,
  extent: number
): [number, number] {
  const n = 2 ** z
  const lng = ((x + px / extent) / n) * 360 - 180
  const mercY = Math.PI * (1 - (2 * (y + py / extent)) / n)
  const lat = (Math.atan(Math.sinh(mercY)) * 180) / Math.PI
  return [lng, lat]
}

/**
 * One representative point for a feature's geometry (tile-local units): the point itself, the
 * middle vertex of the longest line part, or the middle of an area's bounding box.
 * Returns null for empty geometry.
 */
export function representativePoint(
  geometryType: number,
  rings: Array<Array<{ x: number; y: number }>>
): { x: number; y: number } | null {
  const parts = rings.filter((ring) => ring.length > 0)
  if (parts.length === 0) return null
  // vector-tile geometry types: 1 point, 2 line, 3 polygon
  if (geometryType === 1) return parts[0][0]
  if (geometryType === 2) {
    const longest = parts.reduce((a, b) => (b.length > a.length ? b : a))
    return longest[Math.floor(longest.length / 2)]
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of parts) {
    for (const p of ring) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

export type IndexedPlace = {
  name: string
  nameEn: string | null
  layer: IndexLayer
  kind: string
  importance: number
  lat: number
  lng: number
  /** foldText(name + nameEn), the FULLTEXT-indexed column */
  searchText: string
}

/**
 * Deduplication key. The same feature shows up in neighbouring tiles (tile buffers), and a
 * street or river is cut into one piece per tile; keep one entry per name and kind per grid
 * cell (~200 m for points, ~2 km for lines and areas) so the index stays small while a long
 * street or two same-named villages far apart are both still findable.
 */
export function dedupeKey(place: IndexedPlace, isPoint: boolean): string {
  const cell = isPoint ? 0.002 : 0.02
  return [
    place.layer,
    place.kind,
    foldText(place.name),
    Math.round(place.lat / cell),
    Math.round(place.lng / cell),
  ].join('|')
}

/** Build an index entry from a decoded tile feature, or null if it has no usable name. */
export function toIndexedPlace(
  layer: IndexLayer,
  properties: Record<string, unknown>,
  lngLat: [number, number]
): IndexedPlace | null {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 255) : null)
  const name = str(properties.name) ?? str(properties['name:en'])
  if (!name) return null
  const english = str(properties['name:en'])
  const nameEn = english && foldText(english) !== foldText(name) ? english : null
  const kind = str(properties.kind)?.slice(0, 64) ?? layer
  const detail = str(properties.kind_detail)
  return {
    name,
    nameEn,
    layer,
    kind: layer === 'places' && kind === 'locality' && detail ? detail : kind,
    importance: placeImportance(layer, kind, detail),
    lat: lngLat[1],
    lng: lngLat[0],
    searchText: foldText(nameEn ? `${name} ${nameEn}` : name),
  }
}

// ---------------------------------------------------------------------------------------------
// Ranking

export type PlaceCandidate = {
  name: string
  nameEn: string | null
  layer: string
  kind: string
  importance: number
  lat: number
  lng: number
  searchText: string
  file: string
}

export type RankedPlace = PlaceCandidate & { score: number; distanceKm: number | null }

/** Rough distance in km (equirectangular; fine for ranking). */
export function approxDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const x = (lng2 - lng1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180)
  const y = lat2 - lat1
  return Math.sqrt(x * x + y * y) * 111.32
}

/**
 * Filter candidates to those matching every query word, score them, merge near-duplicates
 * (the same street or river split into several entries) and return the best `limit`.
 * Score = importance + name-match bonus - distance penalty (log scale, so something 5 km away
 * beats something 500 km away, but a city far away can still beat a shop nearby).
 */
export function rankPlaces(
  candidates: PlaceCandidate[],
  query: string,
  near: { lat: number; lng: number } | null,
  limit = 10
): RankedPlace[] {
  const words = queryWords(query)
  if (words.length === 0) return []
  const foldedQuery = words.join(' ')

  const scored: RankedPlace[] = []
  for (const candidate of candidates) {
    if (!matchesAllWords(candidate.searchText, words)) continue
    const folded = foldText(candidate.name)
    const foldedEn = candidate.nameEn ? foldText(candidate.nameEn) : null
    let bonus = 0
    if (folded === foldedQuery || foldedEn === foldedQuery) bonus = 40
    else if (folded.startsWith(foldedQuery) || foldedEn?.startsWith(foldedQuery)) bonus = 20
    // "most" as a whole word of "Stari most"
    else if (` ${candidate.searchText} `.includes(` ${foldedQuery} `)) bonus = 15

    const distanceKm = near
      ? approxDistanceKm(near.lat, near.lng, candidate.lat, candidate.lng)
      : null
    const penalty = distanceKm === null ? 0 : Math.min(45, 8 * Math.log2(1 + distanceKm / 2))
    scored.push({ ...candidate, score: candidate.importance + bonus - penalty, distanceKm })
  }

  // Ties are common far away, where the distance penalty is capped: prefer the name closest to
  // what was typed ("Times Square" before "Times Square Building"), then the nearer one.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.name.length - b.name.length ||
      (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
  )

  const kept: RankedPlace[] = []
  for (const place of scored) {
    const duplicate = kept.some(
      (k) =>
        k.kind === place.kind &&
        foldText(k.name) === foldText(place.name) &&
        approxDistanceKm(k.lat, k.lng, place.lat, place.lng) < 3
    )
    if (!duplicate) kept.push(place)
    if (kept.length >= limit) break
  }
  return kept
}
