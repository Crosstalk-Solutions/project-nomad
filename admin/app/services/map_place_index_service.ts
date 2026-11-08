import { open, readdir, stat, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { PMTiles, tileIdToZxy, type Header, type RangeResponse, type Source } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { WORLD_BASEMAP_FILENAME } from '../../constants/map_regions.js'
import {
  INDEXED_LAYERS,
  buildBooleanQuery,
  dedupeKey,
  queryWords,
  rankPlaces,
  representativePoint,
  tilePointToLngLat,
  toIndexedPlace,
  type IndexedPlace,
  type PlaceCandidate,
  type RankedPlace,
} from '../utils/map_place_search.js'
import type { MapPlaceIndexStatus, MapPlaceResult } from '../../types/maps.js'

/** Reads byte ranges of a local .pmtiles file for the `pmtiles` library. */
class LocalFileSource implements Source {
  private handle: FileHandle | null = null

  constructor(private readonly path: string) {}

  getKey(): string {
    return this.path
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.handle ??= await open(this.path, 'r')
    const buffer = Buffer.alloc(length)
    await this.handle.read(buffer, 0, length, offset)
    return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length) }
  }

  async close(): Promise<void> {
    await this.handle?.close()
    this.handle = null
  }
}

/** 53-bit FNV-style hash, so the per-file dedupe set holds numbers instead of long strings. */
function hashKey(key: string): number {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return (h1 >>> 0) * 2 ** 21 + ((h2 >>> 0) & 0x1fffff)
}

type RegionFile = { file: string; size: number; mtimeMs: number }

type IndexRow = {
  file: string
  file_size: number | string
  file_mtime_ms: number | string
  status: 'indexing' | 'ready' | 'failed'
  index_version: number | string
}

const INSERT_BATCH = 1000
const CANDIDATE_LIMIT = 400

/**
 * Offline place search over the downloaded map regions (#1574).
 *
 * Each region .pmtiles file is read once in the background (IndexMapPlacesJob): every tile at
 * the archive's max zoom is decoded and its named places, points of interest, water and streets
 * are stored in `map_places`. Searches then run against MySQL, no tiles are touched.
 */
export class MapPlaceIndexService {
  static readonly PMTILES_DIR = join(process.cwd(), 'storage', 'maps', 'pmtiles')

  /**
   * Bump when what gets indexed or how it is ranked at index time changes (layers, kinds,
   * importance, dedupe), so existing regions are re-indexed on the next reconcile.
   */
  static readonly INDEX_VERSION = 1

  private static stopwords: Set<string> | null = null

  /**
   * Region files that get indexed: everything in the pmtiles dir except the world basemap
   * (z0-5, nothing useful at that zoom) and the full planet build (`YYYYMMDD.pmtiles`,
   * ~100 GB: indexing it would mean decoding hundreds of millions of tiles).
   */
  async listRegionFiles(): Promise<RegionFile[]> {
    let names: string[]
    try {
      names = await readdir(MapPlaceIndexService.PMTILES_DIR)
    } catch {
      return []
    }
    const files: RegionFile[] = []
    for (const file of names) {
      if (!file.endsWith('.pmtiles') || file === WORLD_BASEMAP_FILENAME) continue
      if (/^\d{8}\.pmtiles$/.test(file)) continue
      try {
        const info = await stat(join(MapPlaceIndexService.PMTILES_DIR, file))
        if (info.isFile()) files.push({ file, size: info.size, mtimeMs: Math.floor(info.mtimeMs) })
      } catch {
        // removed between readdir and stat
      }
    }
    return files
  }

  /**
   * Bring the index in line with the files on disk: drop places of deleted files, (re)index
   * new or replaced ones. Loops until a pass finds nothing to do, so files that land while
   * indexing are picked up in the same run.
   */
  async reconcile(): Promise<void> {
    for (let pass = 0; pass < 10; pass++) {
      const [files, rows] = await Promise.all([
        this.listRegionFiles(),
        db
          .from('map_place_indexes')
          .select('file', 'file_size', 'file_mtime_ms', 'status', 'index_version') as Promise<
          IndexRow[]
        >,
      ])
      const onDisk = new Map(files.map((f) => [f.file, f]))
      const byFile = new Map(rows.map((r) => [r.file, r]))

      const removed = rows.filter((row) => !onDisk.has(row.file)).map((row) => row.file)
      for (const file of removed) await this.removeFile(file)

      const toIndex = files.filter((f) => {
        const row = byFile.get(f.file)
        if (!row) return true
        const changed =
          Number(row.file_size) !== f.size ||
          Number(row.file_mtime_ms) !== f.mtimeMs ||
          Number(row.index_version) !== MapPlaceIndexService.INDEX_VERSION
        // 'indexing' here means a previous run died mid-file; a failed file is retried only
        // once it changes (e.g. a re-download), not on every pass.
        return changed || row.status === 'indexing'
      })
      if (removed.length === 0 && toIndex.length === 0) return

      for (const file of toIndex) await this.indexFile(file)
    }
  }

  async removeFile(file: string): Promise<void> {
    await db.from('map_places').where('file', file).delete()
    await db.from('map_place_indexes').where('file', file).delete()
    logger.info(`[MapPlaceIndexService] Removed search index for ${file}`)
  }

  async indexFile(region: RegionFile): Promise<void> {
    const { file } = region
    const started = Date.now()
    await db.from('map_places').where('file', file).delete()
    await db.from('map_place_indexes').where('file', file).delete()
    await db.table('map_place_indexes').insert({
      file,
      file_size: region.size,
      file_mtime_ms: region.mtimeMs,
      index_version: MapPlaceIndexService.INDEX_VERSION,
      status: 'indexing',
      places_count: 0,
      error: null,
      indexed_at: null,
    })

    const source = new LocalFileSource(join(MapPlaceIndexService.PMTILES_DIR, file))
    try {
      const archive = new PMTiles(source)
      const header = await archive.getHeader()
      const seen = new Set<number>()
      let batch: IndexedPlace[] = []
      let count = 0
      let tiles = 0

      const flush = async () => {
        if (batch.length === 0) return
        await db.table('map_places').multiInsert(
          batch.map((p) => ({
            file,
            name: p.name,
            name_en: p.nameEn,
            layer: p.layer,
            kind: p.kind,
            importance: p.importance,
            lat: p.lat,
            lng: p.lng,
            search_text: p.searchText.slice(0, 512),
          }))
        )
        count += batch.length
        batch = []
      }

      for await (const tile of this.tilesAtZoom(archive, header, header.maxZoom)) {
        tiles++
        const vt = new VectorTile(new Pbf(new Uint8Array(tile.data)))
        for (const layerName of INDEXED_LAYERS) {
          const layer = vt.layers[layerName]
          if (!layer) continue
          for (let i = 0; i < layer.length; i++) {
            const feature = layer.feature(i)
            const props = feature.properties as Record<string, unknown>
            if (!props.name && !props['name:en']) continue
            const local = representativePoint(feature.type, feature.loadGeometry())
            if (!local) continue
            const lngLat = tilePointToLngLat(tile.z, tile.x, tile.y, local.x, local.y, layer.extent)
            const place = toIndexedPlace(layerName, props, lngLat)
            if (!place) continue
            const key = hashKey(dedupeKey(place, feature.type === 1))
            if (seen.has(key)) continue
            seen.add(key)
            batch.push(place)
            if (batch.length >= INSERT_BATCH) await flush()
          }
        }
        if (tiles % 20000 === 0) {
          logger.info(
            `[MapPlaceIndexService] ${file}: ${tiles} tiles read, ${count + batch.length} places`
          )
        }
      }
      await flush()

      await db
        .from('map_place_indexes')
        .where('file', file)
        .update({ status: 'ready', places_count: count, indexed_at: new Date() })
      logger.info(
        `[MapPlaceIndexService] Indexed ${count} places from ${tiles} tiles of ${file} in ${Math.round((Date.now() - started) / 1000)}s`
      )
    } catch (error: any) {
      logger.error(`[MapPlaceIndexService] Indexing ${file} failed: ${error?.message ?? error}`)
      await db.from('map_places').where('file', file).delete()
      await db
        .from('map_place_indexes')
        .where('file', file)
        .update({ status: 'failed', error: String(error?.message ?? error).slice(0, 500) })
    } finally {
      await source.close()
    }
  }

  /**
   * Every stored tile at zoom `z`, decompressed, walking the archive's directories directly.
   * Run-length entries (one tile repeated, e.g. open ocean) are skipped: they carry no
   * individual places.
   */
  private async *tilesAtZoom(archive: PMTiles, header: Header, z: number) {
    const stack: Array<[number, number]> = [
      [header.rootDirectoryOffset, header.rootDirectoryLength],
    ]
    while (stack.length > 0) {
      const [offset, length] = stack.pop()!
      const entries = await archive.cache.getDirectory(archive.source, offset, length, header)
      // Leaf directories are pushed in reverse so tiles come out in tile-id order.
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]
        if (entry.runLength === 0) {
          stack.push([header.leafDirectoryOffset + entry.offset, entry.length])
        }
      }
      for (const entry of entries) {
        if (entry.runLength !== 1) continue
        const [tz, x, y] = tileIdToZxy(entry.tileId)
        if (tz !== z) continue
        const raw = await archive.source.getBytes(
          header.tileDataOffset + entry.offset,
          entry.length
        )
        const data = await archive.decompress(raw.data, header.tileCompression)
        yield { z: tz, x, y, data }
      }
    }
  }

  async status(): Promise<MapPlaceIndexStatus> {
    const [files, rows] = await Promise.all([
      this.listRegionFiles(),
      db
        .from('map_place_indexes')
        .select('file', 'file_size', 'file_mtime_ms', 'status', 'places_count', 'index_version'),
    ])
    const byFile = new Map(rows.map((r: any) => [r.file, r]))
    const status: MapPlaceIndexStatus = { ready: 0, pending: 0, failed: 0, places: 0 }
    for (const f of files) {
      const row: any = byFile.get(f.file)
      const current =
        row &&
        Number(row.file_size) === f.size &&
        Number(row.file_mtime_ms) === f.mtimeMs &&
        Number(row.index_version) === MapPlaceIndexService.INDEX_VERSION
      if (current && row.status === 'ready') {
        status.ready++
        status.places += Number(row.places_count)
      } else if (current && row.status === 'failed') {
        status.failed++
      } else {
        status.pending++
      }
    }
    return status
  }

  private async getStopwords(): Promise<Set<string>> {
    if (MapPlaceIndexService.stopwords) return MapPlaceIndexService.stopwords
    try {
      const [rows] = await db.rawQuery(
        'SELECT value FROM INFORMATION_SCHEMA.INNODB_FT_DEFAULT_STOPWORD'
      )
      MapPlaceIndexService.stopwords = new Set(
        (rows as Array<{ value: string }>).map((r) => r.value)
      )
    } catch {
      MapPlaceIndexService.stopwords = new Set()
    }
    return MapPlaceIndexService.stopwords
  }

  async search(
    query: string,
    near: { lat: number; lng: number } | null,
    limit = 10
  ): Promise<MapPlaceResult[]> {
    const words = queryWords(query)
    const booleanQuery = buildBooleanQuery(words, await this.getStopwords())
    if (!booleanQuery) return []

    const select = db
      .from('map_places')
      .select('file', 'name', 'name_en', 'layer', 'kind', 'importance', 'lat', 'lng', 'search_text')
      .whereRaw('MATCH(search_text) AGAINST (? IN BOOLEAN MODE)', [booleanQuery])
      .limit(CANDIDATE_LIMIT)

    // Fetch the most promising candidates by the same importance-minus-distance idea that
    // rankPlaces applies precisely afterwards.
    if (near) {
      select.orderByRaw(
        'importance - LEAST(45, 8 * LOG2(1 + 55.66 * SQRT(POW(lat - ?, 2) + POW((lng - ?) * COS(RADIANS(?)), 2)))) DESC',
        [near.lat, near.lng, near.lat]
      )
    } else {
      select.orderBy('importance', 'desc')
    }

    const rows = (await select) as Array<Record<string, any>>
    const candidates: PlaceCandidate[] = rows.map((r) => ({
      file: r.file,
      name: r.name,
      nameEn: r.name_en,
      layer: r.layer,
      kind: r.kind,
      importance: Number(r.importance),
      lat: Number(r.lat),
      lng: Number(r.lng),
      searchText: r.search_text,
    }))

    return rankPlaces(candidates, query, near, limit).map((p: RankedPlace) => ({
      name: p.name,
      nameEn: p.nameEn,
      kind: p.kind,
      layer: p.layer,
      lat: p.lat,
      lng: p.lng,
      distanceKm: p.distanceKm === null ? null : Math.round(p.distanceKm * 10) / 10,
    }))
  }
}
