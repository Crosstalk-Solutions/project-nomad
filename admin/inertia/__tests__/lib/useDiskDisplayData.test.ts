import { describe, it, expect } from 'vitest'
import { getAllDiskDisplayItems, getPrimaryDiskInfo } from '~/hooks/useDiskDisplayData'
import type { NomadDiskInfo } from '../../../types/system'
import type { Systeminformation } from 'systeminformation'

const mockDisks: NomadDiskInfo[] = [
  {
    name: 'sda',
    totalSize: 1000000000,
    totalUsed: 500000000,
    percentUsed: 50,
    model: 'Test Disk',
    vendor: '',
    rota: false,
    tran: 'sata',
    size: '1000000000',
    filesystems: [],
  },
]

const mockFsSize: Systeminformation.FsSizeData[] = [
  {
    fs: '/dev/sda1',
    type: 'ext4',
    size: 500000000,
    used: 250000000,
    available: 250000000,
    use: 50,
    mount: '/',
    rw: true,
  },
]

describe('getAllDiskDisplayItems', () => {
  it('deve retornar items formatados com discos válidos', () => {
    // Cenário
    const disks = mockDisks
    const fsSize = undefined

    // Ação
    const resultado = getAllDiskDisplayItems(disks, fsSize)

    // Validação
    expect(resultado).toHaveLength(1)
    expect(resultado[0].label).toBe('sda')
    expect(resultado[0].value).toBe(50)
    expect(resultado[0].totalBytes).toBe(1000000000)
    expect(resultado[0].usedBytes).toBe(500000000)
  })

  it('deve usar fallback para fsSize quando discos são undefined', () => {
    // Cenário
    const disks = undefined
    const fsSize = mockFsSize

    // Ação
    const resultado = getAllDiskDisplayItems(disks, fsSize)

    // Validação
    expect(resultado).toHaveLength(1)
    expect(resultado[0].label).toBe('/dev/sda1')
    expect(resultado[0].value).toBe(50)
    expect(resultado[0].totalBytes).toBe(500000000)
    expect(resultado[0].usedBytes).toBe(250000000)
  })

  it('deve retornar array vazio quando ambos são undefined', () => {
    // Cenário
    const disks = undefined
    const fsSize = undefined

    // Ação
    const resultado = getAllDiskDisplayItems(disks, fsSize)

    // Validação
    expect(resultado).toEqual([])
  })
})

describe('getPrimaryDiskInfo', () => {
  it('deve retornar totalSize e totalUsed do maior disco', () => {
    // Cenário
    const disks = mockDisks
    const fsSize = undefined

    // Ação
    const resultado = getPrimaryDiskInfo(disks, fsSize)

    // Validação
    expect(resultado).not.toBeNull()
    expect(resultado!.totalSize).toBe(1000000000)
    expect(resultado!.totalUsed).toBe(500000000)
  })

  it('deve usar fallback para fsSize quando não há discos', () => {
    // Cenário
    const disks = undefined
    const fsSize = mockFsSize

    // Ação
    const resultado = getPrimaryDiskInfo(disks, fsSize)

    // Validação
    expect(resultado).not.toBeNull()
    expect(resultado!.totalSize).toBe(500000000)
    expect(resultado!.totalUsed).toBe(250000000)
  })

  it('deve retornar null quando ambos são vazios', () => {
    // Cenário
    const disks: NomadDiskInfo[] = []
    const fsSize: Systeminformation.FsSizeData[] = []

    // Ação
    const resultado = getPrimaryDiskInfo(disks, fsSize)

    // Validação
    expect(resultado).toBeNull()
  })
})
