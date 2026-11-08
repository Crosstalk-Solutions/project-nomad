import { PMTiles, findTile, zxyToTileId, type Header } from 'pmtiles'
import {
  crossesAntimeridian,
  latToTileY,
  lngRangeFromOccupiedColumns,
  type LngLatBounds,
} from './map_jump'

/**
 * Zoom used to find where an antimeridian-crossing archive actually has data: 256 columns of
 * 1.4° each, enough to frame Fiji or the Aleutians snugly. Cheap because only the archive's
 * directories are read (see tileExists), never tile data, and low-zoom tile ids sit at the
 * start of the directory, so only its first entries are ever fetched.
 */
const ANTIMERIDIAN_PROBE_ZOOM = 8

/**
 * Whether the archive contains tile z/x/y, resolved from its directories alone. Mirrors the
 * lookup in PMTiles.getZxyAttempt but stops before fetching the tile bytes, so probing a
 * whole row of columns costs a few small directory reads (cached by the PMTiles instance).
 */
async function tileExists(archive: PMTiles, header: Header, z: number, x: number, y: number) {
  const tileId = zxyToTileId(z, x, y)
  let offset = header.rootDirectoryOffset
  let length = header.rootDirectoryLength
  for (let depth = 0; depth <= 3; depth++) {
    const directory = await archive.cache.getDirectory(archive.source, offset, length, header)
    const entry = findTile(directory, tileId)
    if (!entry) return false
    if (entry.runLength > 0) return true
    offset = header.leafDirectoryOffset + entry.offset
    length = entry.length
  }
  return false
}

/**
 * Bounds of the data in a PMTiles archive, for fitting the map to a downloaded region.
 *
 * The header bounds are used as-is unless they span (nearly) the whole world, which is what an
 * archive crossing the antimeridian reports (Alaska, Fiji, Russia: [-180, 180]). In that case
 * the columns that really contain tiles are probed and the world is cut at the largest empty
 * gap, giving an east edge above 180 that MapLibre frames across the date line.
 */
export async function fetchRegionBounds(url: string): Promise<LngLatBounds> {
  const archive = new PMTiles(url)
  const header = await archive.getHeader()
  const bounds: LngLatBounds = {
    west: header.minLon,
    south: header.minLat,
    east: header.maxLon,
    north: header.maxLat,
  }
  if (!crossesAntimeridian(bounds)) return bounds

  const z = Math.min(Math.max(ANTIMERIDIAN_PROBE_ZOOM, header.minZoom), header.maxZoom)
  const columns = 2 ** z
  const firstRow = latToTileY(header.maxLat, z)
  const lastRow = latToTileY(header.minLat, z)

  const occupied = await Promise.all(
    Array.from({ length: columns }, async (_, x) => {
      for (let y = firstRow; y <= lastRow; y++) {
        if (await tileExists(archive, header, z, x, y)) return true
      }
      return false
    })
  )

  const range = lngRangeFromOccupiedColumns(occupied)
  return range ? { ...bounds, ...range } : bounds
}
