import { statfs } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { MapRegionError } from './map_region_catalog.js'

export interface MapRegionCapacity {
  /** The smaller usable capacity when data lives on a sparse virtual disk. */
  availableBytes: number
  volumeAvailableBytes: number
  backingAvailableBytes?: number
}

/** Keep zero available space meaningful; invalid telemetry must not admit work. */
export function effectiveCapacity(
  volumeAvailableBytes: number,
  backingAvailableBytes?: number
): MapRegionCapacity {
  const values =
    backingAvailableBytes === undefined
      ? [volumeAvailableBytes]
      : [volumeAvailableBytes, backingAvailableBytes]
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new MapRegionError(
      'Storage capacity could not be verified because the reported free space is invalid.',
      503
    )
  return {
    availableBytes: Math.min(...values),
    volumeAvailableBytes,
    ...(backingAvailableBytes === undefined ? {} : { backingAvailableBytes }),
  }
}

async function freeBytes(path: string, backing: boolean): Promise<number> {
  try {
    const info = await statfs(path)
    if (!Number.isFinite(info.bsize) || info.bsize <= 0)
      throw new Error('Invalid filesystem block size')
    const available = info.bavail * info.bsize
    if (!Number.isFinite(available) || available < 0) throw new Error('Invalid filesystem capacity')
    return available
  } catch {
    // Paths and underlying OS errors can contain private host information.
    throw new MapRegionError(
      backing
        ? 'Could not verify free space on the configured backing disk. Check that its storage probe is mounted and accessible before downloading.'
        : 'Could not verify free space on the maps data volume. Check that its storage is mounted and accessible before downloading.',
      503
    )
  }
}

/**
 * Native Linux needs only the data-volume probe. Sparse VHD/VM deployments may
 * additionally mount an empty directory from the actual backing disk read-only.
 * Reading statfs requires neither file contents nor a privileged helper service.
 */
export async function mapRegionCapacity(
  root: string,
  backingPath = process.env.MAP_REGIONS_BACKING_DISK_PATH
): Promise<MapRegionCapacity> {
  if (backingPath !== undefined && (!backingPath || !isAbsolute(backingPath)))
    throw new MapRegionError(
      'The backing disk storage probe must be configured with an absolute container path.',
      503
    )
  const volumeAvailableBytes = await freeBytes(root, false)
  const backingAvailableBytes =
    backingPath === undefined ? undefined : await freeBytes(backingPath, true)
  return effectiveCapacity(volumeAvailableBytes, backingAvailableBytes)
}

/** Physical preparation estimate; never a fixed source-file size ceiling. */
export function mapRegionPreparationRequirement(sources: { size: number; format: string }[]) {
  if (!sources.length) return 0
  const reserve = sources.some((source) => source.format === 'osm-pbf') ? 8 * 1024 ** 3 : 1024 ** 3
  return (
    sources.reduce(
      (sum, source) => sum + source.size * (source.format === 'cnefe-zip' ? 3 : 12),
      0
    ) + reserve
  )
}
