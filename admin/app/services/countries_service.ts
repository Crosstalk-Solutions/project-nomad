import { access, readFile, writeFile, mkdir } from 'fs/promises'
import { join, resolve } from 'path'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import logger from '@adonisjs/core/services/logger'
import type { Country, CountryCode, CountryGroup } from '../../types/maps.js'

interface NEFeature {
  type: 'Feature'
  properties: Record<string, any>
  geometry: unknown
}

interface NEFeatureCollection {
  type: 'FeatureCollection'
  features: NEFeature[]
}

const COUNTRY_GEOJSON_PATH = join(
  process.cwd(),
  'resources',
  'geodata',
  'ne_50m_admin_0_countries.geojson'
)

// Natural Earth country polygons are land-only (no territorial waters), so a
// strict intersect leaves tiles fully over the ocean out of the extract —
// coastal cities render as grey off their coast. Inflate each polygon outward
// by ~11 km to pull in adjacent tiles without ballooning the extract size.
const REGION_BUFFER_DEGREES = 0.1

const GROUP_ORDER = [
  'north-america',
  'south-america',
  'europe',
  'africa',
  'asia',
  'oceania',
]

const GROUP_META: Record<string, { id: string; name: string; description: string }> = {
  'North America': {
    id: 'north-america',
    name: 'North America',
    description: 'All countries in North America and the Caribbean.',
  },
  'South America': {
    id: 'south-america',
    name: 'South America',
    description: 'All countries in South America.',
  },
  Europe: {
    id: 'europe',
    name: 'Europe',
    description: 'All countries in Europe.',
  },
  Africa: {
    id: 'africa',
    name: 'Africa',
    description: 'All countries in Africa.',
  },
  Asia: {
    id: 'asia',
    name: 'Asia',
    description: 'All countries in Asia.',
  },
  Oceania: {
    id: 'oceania',
    name: 'Oceania',
    description: 'Australia, New Zealand, and Pacific island nations.',
  },
}

export class CountriesService {
  private static instance: CountriesService | null = null
  private loadPromise: Promise<void> | null = null
  private countries: Country[] = []
  private byCode: Map<CountryCode, { country: Country; feature: NEFeature }> = new Map()
  private groups: CountryGroup[] = []

  static getInstance(): CountriesService {
    if (!this.instance) {
      this.instance = new CountriesService()
    }
    return this.instance
  }

  private async ensureLoaded(): Promise<void> {
    if (this.byCode.size > 0) return
    if (!this.loadPromise) {
      this.loadPromise = this.load()
    }
    await this.loadPromise
  }

  private async load(): Promise<void> {
    const raw = await readFile(COUNTRY_GEOJSON_PATH, 'utf8')
    const fc = JSON.parse(raw) as NEFeatureCollection

    // Natural Earth reuses a sovereign state's ISO_A2 for its dependencies
    // (e.g. AU covers both Australia and Australian territories). Sort so the
    // sovereign mainland wins the ISO-code slot, and skip any subsequent
    // same-code dependency — otherwise the "AU" entry ends up being some tiny
    // island territory.
    const sortedFeatures = [...fc.features].sort((a, b) => typeRank(a) - typeRank(b))

    const countries: Country[] = []
    const byCode = new Map<CountryCode, { country: Country; feature: NEFeature }>()
    const groupCodes: Record<string, CountryCode[]> = {}

    for (const feature of sortedFeatures) {
      const p = feature.properties
      const code = resolveIso2(p)
      if (!code) continue
      if (byCode.has(code)) continue

      const continent = typeof p.CONTINENT === 'string' ? p.CONTINENT : 'Other'
      if (continent === 'Antarctica' || continent === 'Seven seas (open ocean)') continue

      const country: Country = {
        code,
        code3: resolveIso3(p) ?? code,
        name: typeof p.NAME === 'string' ? p.NAME : code,
        continent,
        subregion: typeof p.SUBREGION === 'string' ? p.SUBREGION : continent,
        population: typeof p.POP_EST === 'number' ? p.POP_EST : 0,
      }

      countries.push(country)
      byCode.set(code, { country, feature })

      if (GROUP_META[continent]) {
        const groupId = GROUP_META[continent].id
        if (!groupCodes[groupId]) groupCodes[groupId] = []
        groupCodes[groupId].push(code)
      }
    }

    countries.sort((a, b) => a.name.localeCompare(b.name))

    const groups: CountryGroup[] = GROUP_ORDER.flatMap((groupId) => {
      const meta = Object.values(GROUP_META).find((m) => m.id === groupId)
      if (!meta) return []
      const codes = (groupCodes[groupId] ?? []).slice().sort()
      if (codes.length === 0) return []
      return [{ id: meta.id, name: meta.name, description: meta.description, countries: codes }]
    })

    this.countries = countries
    this.byCode = byCode
    this.groups = groups

    logger.info(
      `[CountriesService] Loaded ${countries.length} countries across ${groups.length} groups`
    )
  }

  async list(): Promise<Country[]> {
    await this.ensureLoaded()
    return this.countries
  }

  async listGroups(): Promise<CountryGroup[]> {
    await this.ensureLoaded()
    return this.groups
  }

  /** Throws when a supplied code does not map to a known country. */
  async resolveCodes(codes: CountryCode[]): Promise<CountryCode[]> {
    await this.ensureLoaded()
    const normalized = [...new Set(codes.map((c) => c.toUpperCase()))].sort()
    const unknown = normalized.filter((c) => !this.byCode.has(c))
    if (unknown.length > 0) {
      throw new Error(`Unknown country code(s): ${unknown.join(', ')}`)
    }
    return normalized
  }

  /**
   * Filename is keyed on a hash of the sorted ISO codes + buffer size so
   * repeated calls with the same selection reuse the same path, and bumping
   * the buffer auto-invalidates stale files.
   */
  async writeRegionFile(codes: CountryCode[]): Promise<string> {
    await this.ensureLoaded()
    const resolved = await this.resolveCodes(codes)
    const key = `b${REGION_BUFFER_DEGREES}:${resolved.join(',')}`
    const hash = createHash('sha1').update(key).digest('hex').slice(0, 12)

    const dir = resolve(tmpdir(), 'nomad-pmtiles-regions')
    await mkdir(dir, { recursive: true })
    const filepath = join(dir, `region-${hash}.geojson`)

    try {
      await access(filepath)
      return filepath
    } catch {}

    const fc = {
      type: 'FeatureCollection',
      features: resolved.map((code) => {
        const entry = this.byCode.get(code)!
        return {
          type: 'Feature',
          properties: { iso: code, name: entry.country.name },
          geometry: bufferGeometry(entry.feature.geometry, REGION_BUFFER_DEGREES),
        }
      }),
    }

    await writeFile(filepath, JSON.stringify(fc))
    return filepath
  }
}

function typeRank(f: NEFeature): number {
  const t = typeof f.properties.TYPE === 'string' ? f.properties.TYPE : ''
  if (t === 'Sovereign country') return 0
  if (t === 'Country') return 1
  if (t === 'Sovereignty') return 2
  if (t === 'Disputed') return 3
  if (t === 'Dependency') return 4
  return 5
}

function resolveIso2(p: Record<string, any>): CountryCode | null {
  // Natural Earth's ISO_A2 sometimes holds political escapes like "CN-TW" for
  // Taiwan or "-99" for countries involved in disputes. Only accept clean
  // 2-letter codes; fall back to ISO_A2_EH (which reliably has the real code).
  const primary = typeof p.ISO_A2 === 'string' ? p.ISO_A2 : null
  if (primary && /^[A-Z]{2}$/i.test(primary)) return primary.toUpperCase()
  const fallback = typeof p.ISO_A2_EH === 'string' ? p.ISO_A2_EH : null
  if (fallback && /^[A-Z]{2}$/i.test(fallback)) return fallback.toUpperCase()
  return null
}

/**
 * Inflate each polygon ring outward by `buffer` degrees via per-vertex
 * averaged-normal offset. Not geodesically accurate — but at small buffers
 * (<= 0.2°) it's within a few percent of a proper geodesic buffer at
 * country scale, which is plenty for tile-inclusion purposes.
 */
function bufferGeometry(geometry: unknown, buffer: number): unknown {
  const geom = geometry as { type: string; coordinates: any }
  if (geom?.type === 'Polygon') {
    return { type: 'Polygon', coordinates: bufferPolygonRings(geom.coordinates, buffer) }
  }
  if (geom?.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly: number[][][]) =>
        bufferPolygonRings(poly, buffer)
      ),
    }
  }
  return geometry
}

function bufferPolygonRings(rings: number[][][], buffer: number): number[][][] {
  return rings.map((ring) => bufferRing(ring, buffer))
}

function bufferRing(ring: number[][], buffer: number): number[][] {
  if (ring.length < 4) return ring
  const sign = signedArea(ring) > 0 ? 1 : -1
  const n = ring.length - 1
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]
    const curr = ring[i]
    const next = ring[(i + 1) % n]
    const e1x = curr[0] - prev[0]
    const e1y = curr[1] - prev[1]
    const e2x = next[0] - curr[0]
    const e2y = next[1] - curr[1]
    const l1 = Math.hypot(e1x, e1y) || 1
    const l2 = Math.hypot(e2x, e2y) || 1
    const n1x = (e1y / l1) * sign
    const n1y = (-e1x / l1) * sign
    const n2x = (e2y / l2) * sign
    const n2y = (-e2x / l2) * sign
    const sumX = n1x + n2x
    const sumY = n1y + n2y
    const sl = Math.hypot(sumX, sumY) || 1
    out.push([curr[0] + (sumX / sl) * buffer, curr[1] + (sumY / sl) * buffer])
  }
  out.push(out[0])
  return out
}

function signedArea(ring: number[][]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return a / 2
}

function resolveIso3(p: Record<string, any>): string | null {
  const primary = typeof p.ISO_A3 === 'string' ? p.ISO_A3 : null
  if (primary && primary !== '-99') return primary.toUpperCase()
  const fallback = typeof p.ISO_A3_EH === 'string' ? p.ISO_A3_EH : null
  if (fallback && fallback !== '-99') return fallback.toUpperCase()
  const adm = typeof p.ADM0_A3 === 'string' ? p.ADM0_A3 : null
  if (adm && adm !== '-99') return adm.toUpperCase()
  return null
}

