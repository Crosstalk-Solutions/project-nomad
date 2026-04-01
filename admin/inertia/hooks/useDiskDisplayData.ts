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

function getDisplayableFilesystems(
  fsSize: Systeminformation.FsSizeData[] | undefined
): Systeminformation.FsSizeData[] {
  if (!fsSize || fsSize.length === 0) return []

  const seen = new Set<number>()
  const uniqueFs = fsSize.filter((fs) => {
    if (fs.size <= 0 || seen.has(fs.size)) return false
    seen.add(fs.size)
    return true
  })

  const linuxBlockDevices = uniqueFs.filter((fs) => fs.fs.startsWith('/dev/'))
  if (linuxBlockDevices.length > 0) {
    return linuxBlockDevices
  }

  return uniqueFs.filter((fs) => {
    const mount = fs.mount || ''
    const device = fs.fs || ''

    if (!mount || mount.startsWith('/var/lib/docker')) return false
    if (
      device.startsWith('overlay') ||
      device.startsWith('tmpfs') ||
      device.startsWith('shm') ||
      device.startsWith('devtmpfs')
    ) {
      return false
    }

    return true
  })
}

/** Get all valid disks formatted for display (settings/system page) */
export function getAllDiskDisplayItems(
  disks: NomadDiskInfo[] | undefined,
  fsSize: Systeminformation.FsSizeData[] | undefined
): DiskDisplayItem[] {
  const validDisks = disks?.filter((d) => d.totalSize > 0) || []

  if (validDisks.length > 0) {
    return validDisks.map((disk) => ({
      label: disk.name || 'Unknown',
      value: disk.percentUsed || 0,
      total: formatBytes(disk.totalSize),
      used: formatBytes(disk.totalUsed),
      subtext: `${formatBytes(disk.totalUsed || 0)} / ${formatBytes(disk.totalSize || 0)}`,
      totalBytes: disk.totalSize,
      usedBytes: disk.totalUsed,
    }))
  }

  if (fsSize && fsSize.length > 0) {
    const displayFs = getDisplayableFilesystems(fsSize)
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
    const realDevices = getDisplayableFilesystems(fsSize)
    const primary =
      realDevices.length > 0
        ? realDevices.reduce((a, b) => (b.size > a.size ? b : a))
        : fsSize[0]
    return { totalSize: primary.size, totalUsed: primary.used }
  }

  return null
}
