import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { PMTiles, TileType, type Source } from 'pmtiles'
import sharp from 'sharp'
import type { WorldArchive } from '../../types/world_offline.js'
import { elevationContains } from '../../types/elevation_coverage.js'

export type LocalElevationArchive = { path: string; archive: WorldArchive }

const maxRangeBytes = 16 * 1024 * 1024
const maximumDecodedTiles = 16
export type ElevationTile = (pixelOffset: number) => number | null
export type ReadElevationTile = (zoom: number, x: number, y: number) => Promise<ElevationTile | null>
const decodedTiles = new Map<string, ElevationTile | null>()

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
      const key = `${archive.sha256}/${stat.ino}/${stat.mtimeMs}/${archive.tileSize}/${zoom}/${x}/${y}`
      if (decodedTiles.has(key)) {
        const present = decodedTiles.get(key)!
        decodedTiles.delete(key)
        decodedTiles.set(key, present)
        return present
      }
      const tile = await pmtiles.getZxy(zoom, x, y, signal)
      const decoded = tile ? await decodeTerrarium(tile.data, archive.tileSize) : null
      signal?.throwIfAborted()
      if (decodedTiles.size >= maximumDecodedTiles) decodedTiles.delete(decodedTiles.keys().next().value!)
      decodedTiles.set(key, decoded)
      return decoded
    })
  } finally {
    await file.close()
  }
}

/** Open a bounded set of immutable archives and read one native XYZ grid.
 * Adjacent regions supply each other's seam samples; revisions never resample
 * a coarse world tile into a purported fine regional tile.
 */
export async function withElevationMosaic<T>(
  entries: LocalElevationArchive[], read: (tile: ReadElevationTile) => Promise<T>, signal?: AbortSignal,
): Promise<T | null> {
  if (!entries.length || entries.length > 64) return null
  const readers: { entry: LocalElevationArchive; tile: ReadElevationTile }[] = []
  async function opened(index: number): Promise<T | null> {
    signal?.throwIfAborted()
    if (index === entries.length) return read(async (zoom, x, y) => {
      const count = 2 ** zoom
      if (y < 0 || y >= count) return null
      const longitude = (x + .5) / count * 360 - 180
      const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + .5) / count))) * 180 / Math.PI
      for (const source of readers) {
        if (!elevationContains(source.entry.archive.bounds, longitude, latitude)) continue
        const tile = await source.tile(zoom, x, y)
        // An absent tile or transparent sample is genuine no-data, not an
        // invitation to stitch unrelated revisions at a lower native level.
        if (tile) return tile
      }
      return null
    })
    return withElevationTiles(entries[index], async (tile) => {
      readers.push({ entry: entries[index], tile })
      try { return await opened(index + 1) }
      finally { readers.pop() }
    }, signal)
  }
  return opened(0)
}
