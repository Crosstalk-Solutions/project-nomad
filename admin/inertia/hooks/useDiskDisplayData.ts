import { NomadDiskInfo } from '../../types/system'
import { Systeminformation } from 'systeminformation'
import { formatBytes } from '~/lib/util'

type DiskDisplayItem = {
  label: string
  value: number
  total: string
  used: string
  subtext: string
  totalBytes: number
  usedBytes: number
}

/** Get all valid disks formatted for display (settings/system page) */
export function getAllDiskDisplayItems(
  disks: NomadDiskInfo[] | undefined,
  fsSize: Systeminformation.FsSizeData[] | undefined
): DiskDisplayItem[] {
  const validDisks = disks?.filter((d) => d.totalSize > 0) || []

  // If /app/storage is on a dedicated filesystem (e.g. NFS), it won't appear
  // in the block-device list. Prepend it so NAS and OS disk are both shown.
  const storageMount = fsSize?.find((fs) => fs.mount === '/app/storage' && fs.size > 0)
  const storageMountItem: DiskDisplayItem[] = storageMount
    ? [
        {
          label: 'NAS Storage',
          value: storageMount.use || 0,
          total: formatBytes(storageMount.size),
          used: formatBytes(storageMount.used),
          subtext: `${formatBytes(storageMount.used)} / ${formatBytes(storageMount.size)}`,
          totalBytes: storageMount.size,
          usedBytes: storageMount.used,
        },
      ]
    : []

  if (validDisks.length > 0) {
    return [
      ...storageMountItem,
      ...validDisks.map((disk) => ({
        label: disk.name || 'Unknown',
        value: disk.percentUsed || 0,
        total: formatBytes(disk.totalSize),
        used: formatBytes(disk.totalUsed),
        subtext: `${formatBytes(disk.totalUsed || 0)} / ${formatBytes(disk.totalSize || 0)}`,
        totalBytes: disk.totalSize,
        usedBytes: disk.totalUsed,
      })),
    ]
  }

  if (fsSize && fsSize.length > 0) {
    const seen = new Set<number>()
    const uniqueFs = fsSize.filter((fs) => {
      if (fs.size <= 0 || seen.has(fs.size)) return false
      seen.add(fs.size)
      return true
    })
    const realDevices = uniqueFs.filter((fs) => fs.fs.startsWith('/dev/'))
    const displayFs = realDevices.length > 0 ? realDevices : uniqueFs
    return displayFs.map((fs) => ({
      label: fs.fs || 'Unknown',
      value: fs.use || 0,
      total: formatBytes(fs.size),
      used: formatBytes(fs.used),
      subtext: `${formatBytes(fs.used)} / ${formatBytes(fs.size)}`,
      totalBytes: fs.size,
      usedBytes: fs.used,
    }))
  }

  return []
}

/** Get primary disk info for storage projection (easy-setup page) */
export function getPrimaryDiskInfo(
  disks: NomadDiskInfo[] | undefined,
  fsSize: Systeminformation.FsSizeData[] | undefined
): { totalSize: number; totalUsed: number } | null {
  // First, check if /app/storage is on a dedicated filesystem (e.g. NFS mount).
  // This is the most accurate source since it reflects the actual backing
  // store for NOMAD content, regardless of whether it's a local disk or
  // network-attached storage.
  const storageMount = fsSize?.find((fs) => fs.mount === '/app/storage' && fs.size > 0)
  if (storageMount) {
    return { totalSize: storageMount.size, totalUsed: storageMount.used }
  }

  const validDisks = disks?.filter((d) => d.totalSize > 0) || []
  if (validDisks.length > 0) {
    const diskWithRoot = validDisks.find((d) =>
      d.filesystems?.some((fs) => fs.mount === '/' || fs.mount === '/storage')
    )
    const primary =
      diskWithRoot || validDisks.reduce((a, b) => (b.totalSize > a.totalSize ? b : a))
    return { totalSize: primary.totalSize, totalUsed: primary.totalUsed }
  }

  if (fsSize && fsSize.length > 0) {
    const realDevices = fsSize.filter((fs) => fs.fs.startsWith('/dev/'))
    const primary =
      realDevices.length > 0
        ? realDevices.reduce((a, b) => (b.size > a.size ? b : a))
        : fsSize[0]
    return { totalSize: primary.size, totalUsed: primary.used }
  }

  return null
}
