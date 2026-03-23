import { describe, it, expect } from 'vitest'
import { getAllDiskDisplayItems, getPrimaryDiskInfo } from './useDiskDisplayData'
import { NomadDiskInfo } from '../../types/system'

// Mock data to simulate disks
const mockDisks = [
  {
    name: 'sda', totalSize: 1000, totalUsed: 500, percentUsed: 50,
    filesystems: [{ mount: '/boot', fs: '/dev/sda1', used: 10, size: 100, percentUsed: 10 }]
  },
  {
    name: 'nvme0n1', totalSize: 5000, totalUsed: 4000, percentUsed: 80,
    filesystems: [{ mount: '/', fs: '/dev/nvme0n1p1', used: 4000, size: 5000, percentUsed: 80 }]
  }
] as NomadDiskInfo[]

const mockFsSize = [
  { fs: '/dev/sda1', size: 1000, used: 500, use: 50 },
  { fs: 'tmpfs', size: 200, used: 10, use: 5 }
] as any

describe('useDiskDisplayData', () => {
  describe('getAllDiskDisplayItems', () => {
    it('should return empty array if no data is provided', () => {
      expect(getAllDiskDisplayItems(undefined, undefined)).toEqual([])
    })

    it('should map NomadDiskInfo correctly and calculate formatBytes', () => {
      const result = getAllDiskDisplayItems(mockDisks, undefined)
      expect(result).toHaveLength(2)
      expect(result[0].label).toBe('sda')
      expect(result[1].label).toBe('nvme0n1')
      expect(result[1].value).toBe(80)
    })

    it('should fallback to fsSize if disks array is empty', () => {
      const result = getAllDiskDisplayItems([], mockFsSize)
      // Should filter out tmpfs and only keep physical devices (/dev/)
      expect(result).toHaveLength(1) 
      expect(result[0].label).toBe('/dev/sda1')
    })
  })

  describe('getPrimaryDiskInfo', () => {
    it('should return null if no data is provided', () => {
      expect(getPrimaryDiskInfo(undefined, undefined)).toBeNull()
    })

    it('should return the disk mounted at root (/)', () => {
      const result = getPrimaryDiskInfo(mockDisks, undefined)
      expect(result).toEqual({ totalSize: 5000, totalUsed: 4000 })
    })

    it('should fallback to fsSize if disks is empty', () => {
      const result = getPrimaryDiskInfo([], mockFsSize)
      expect(result).toEqual({ totalSize: 1000, totalUsed: 500 })
    })
  })
})