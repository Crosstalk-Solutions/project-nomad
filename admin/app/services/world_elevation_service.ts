import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { PMTiles, TileType, type Source } from 'pmtiles'
import sharp from 'sharp'
import type { ElevationLookup, WorldArchive } from '../../types/world_offline.js'

export type LocalElevationArchive = { path: string; archive: WorldArchive }

const maxMercatorLatitude = 85.0511287798066
const maxRangeBytes = 16 * 1024 * 1024
export type ElevationTile = (pixelOffset: number) => number | null
export type ReadElevationTile = (zoom: number, x: number, y: number) => Promise<ElevationTile | null>

function localSource(file: FileHandle, archive: WorldArchive): Source {
  return {
    getKey: () => archive.sha256,
    async getBytes(offset, length, signal) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= archive.installedBytes ||
          !Number.isSafeInteger(length) || length < 1 || length > maxRangeBytes) {
        throw new Error('Invalid elevation archive range')
      }

      // PMTiles reads up to 16 KiB initially. A tiny archive can end inside that read.
      const size = offset === 0 && length === 16_384 ? Math.min(length, archive.installedBytes) : length
      if (size > archive.installedBytes - offset) throw new Error('Truncated elevation archive range')
      const data = new ArrayBuffer(size)
      const bytes = new Uint8Array(data)
      let total = 0
      while (total < size) {
        signal?.throwIfAborted()
        const { bytesRead } = await file.read(bytes, total, size - total, offset + total)
        if (bytesRead === 0) throw new Error('Truncated elevation archive read')
        total += bytesRead
      }
      return { data }
    },
  }
}

export function elevationTilePixel(lat: number, lng: number, zoom: number, tileSize: number) {
  const width = tileSize * 2 ** zoom
  const mercatorY = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2
  const x = Math.min(width - 1, Math.max(0, Math.floor((lng + 180) / 360 * width)))
  const y = Math.min(width - 1, Math.max(0, Math.floor(mercatorY * width)))
  return {
    tileX: Math.floor(x / tileSize),
    tileY: Math.floor(y / tileSize),
    pixelOffset: (y % tileSize) * tileSize + x % tileSize,
  }
}

export function withinElevationCoverage(archive: WorldArchive, lat: number, lng: number) {
  const [west, south, east, north] = archive.bounds
  return Math.abs(lat) <= maxMercatorLatitude && lat >= south && lat <= north && lng >= west && lng <= east
}

async function decodeTerrarium(data: ArrayBuffer, tileSize: number): Promise<ElevationTile> {
  const { data: pixels, info } = await sharp(Buffer.from(data), {
    ignoreIcc: true,
    limitInputPixels: tileSize ** 2,
  }).raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (width !== tileSize || height !== tileSize || (channels !== 3 && channels !== 4)) {
    throw new Error('Invalid elevation tile dimensions or channels')
  }

  return (pixelOffset) => {
    const offset = pixelOffset * channels
    if (channels === 4 && pixels[offset + 3] === 0) return null
    return pixels[offset] * 256 + pixels[offset + 1] + pixels[offset + 2] / 256 - 32768
  }
}

export async function withElevationTiles<T>(
  { path, archive }: LocalElevationArchive,
  read: (readTile: ReadElevationTile) => Promise<T>,
  signal?: AbortSignal,
): Promise<T | null> {
  signal?.throwIfAborted()
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null // A package may be removed after its manifest was read.
    throw error
  })
  if (!file) return null
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size !== archive.installedBytes) {
      throw new Error('The installed elevation archive changed while opening it')
    }
    const pmtiles = new PMTiles(localSource(file, archive))
    const header = await pmtiles.getHeader()
    if (header.tileType !== TileType.Webp || header.minZoom !== archive.minzoom || header.maxZoom !== archive.maxzoom) {
      throw new Error('The installed elevation archive header is invalid')
    }

    return await read(async (zoom, x, y) => {
      signal?.throwIfAborted()
      const tile = await pmtiles.getZxy(zoom, x, y, signal)
      return tile ? decodeTerrarium(tile.data, archive.tileSize) : null
    })
  } finally {
    await file.close()
  }
}

async function readElevation(entry: LocalElevationArchive, lat: number, lng: number) {
  const { archive } = entry
  return withElevationTiles(entry, async (readTile) => {
    // Sampling follows the native elevation resolution, independent of the camera zoom.
    for (let zoom = archive.maxzoom; zoom >= archive.minzoom; zoom -= 1) {
      const { tileX, tileY, pixelOffset } = elevationTilePixel(lat, lng, zoom, archive.tileSize)
      const sample = await readTile(zoom, tileX, tileY)
      const elevationMeters = sample?.(pixelOffset) ?? null
      if (elevationMeters !== null) return { elevationMeters, zoom }
    }
    return null
  })
}

export async function lookupElevation(archives: LocalElevationArchive[], lat: number, lng: number): Promise<ElevationLookup> {
  if (!archives.length) return { status: 'not-installed' }

  const longitude = lng === 180 ? -180 : lng
  for (const entry of [...archives].sort((a, b) => b.archive.maxzoom - a.archive.maxzoom)) {
    if (!withinElevationCoverage(entry.archive, lat, longitude)) continue
    const elevation = await readElevation(entry, lat, longitude)
    if (elevation) return { status: 'ok', ...elevation }
  }
  return { status: 'no-data' }
}
