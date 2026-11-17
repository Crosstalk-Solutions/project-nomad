import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import type { WorldArchive, WorldInventory, WorldJob, WorldPack } from '../../types/world_offline.js'
import type { LocalElevationArchive } from './world_elevation_service.js'

const filenamePattern = /^raster-lab-world-[a-z0-9-]+\.pmtiles$/
const digestPattern = /^[a-f0-9]{64}$/
const manifestName = 'lab-world-archive-manifest.json'
const packDirectory = () => app.makePath('storage', 'maps', 'pmtiles')
type CatalogEntry = Omit<WorldPack, 'installed' | 'archives'> & { files: string[] }
type WorkerAction = 'download' | 'remove' | 'cancel' | 'retry' | 'pause' | 'resume' | 'discard'
type WorkerReply = {
  job?: WorldJob | null
  skipped?: boolean
  removed?: boolean
  removedBytes?: number
  freedDiskBytes?: number
  message?: string
}

export class WorldOfflineError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function worldOfflineEnabled() {
  return env.get('WORLD_OFFLINE_ENABLED') ?? false
}

function identifyInventory(inventory: WorldInventory): WorldInventory {
  const versions = inventory.packs.filter((pack) => pack.installed).flatMap(({ archives }) =>
    (archives ?? []).map(({ filename, sha256 }) => filename + ':' + sha256))
  return {
    ...inventory,
    generation: createHash('sha256').update(versions.sort().join('\n')).digest('hex'),
  }
}

function isManagedArchive(value: unknown, expected: string): value is WorldArchive {
  if (!value || typeof value !== 'object' || !filenamePattern.test(expected)) return false
  const record = value as Partial<WorldArchive>
  return record.filename === expected && Number.isSafeInteger(record.installedBytes)
    && (record.installedBytes ?? 0) > 0 && typeof record.sha256 === 'string' && digestPattern.test(record.sha256)
    && Number.isInteger(record.minzoom) && Number.isInteger(record.maxzoom)
    && Array.isArray(record.bounds) && record.bounds.length === 4 && record.bounds.every(Number.isFinite)
}

export class WorldOfflineService {
  private async catalog(): Promise<CatalogEntry[]> {
    const input = await readFile(app.makePath('resources', 'world-offline', 'catalog.json'), 'utf8')
    return JSON.parse(input)
  }

  private async manifest(): Promise<Record<string, unknown> | undefined> {
    const path = join(packDirectory(), manifestName)
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return '{}'
    })
    const manifest = JSON.parse(raw)
    return manifest?.schemaVersion === 1 ? manifest.packs : undefined
  }

  private async localPacks(role?: WorldPack['role']): Promise<WorldPack[]> {
    const directory = packDirectory()
    const [catalog, owned] = await Promise.all([this.catalog(), this.manifest()])
    const entries = role ? catalog.filter((entry) => entry.role === role) : catalog
    const packs = await Promise.all(entries.map(async ({ files, ...entry }): Promise<WorldPack> => {
      const unavailable = { ...entry, installed: false }
      const records = owned?.[entry.id]
      if (!Array.isArray(records) || records.length !== files.length || !files.length) return unavailable
      const archives = await Promise.all(files.map(async (filename, index) => {
        const record = records[index]
        if (!isManagedArchive(record, filename)) return null
        const stat = await lstat(join(directory, filename)).catch(() => null)
        return stat?.isFile() && stat.size === record.installedBytes ? record : null
      }))
      if (!archives.every((archive): archive is WorldArchive => archive !== null)) return unavailable
      return { ...entry, installed: true, archives, installedBytes: archives.reduce((sum, file) => sum + file.installedBytes, 0) }
    }))
    const highest = new Map<string, number>()
    for (const pack of packs) {
      if (pack.installed && pack.role && pack.maxZoom !== undefined) {
        highest.set(pack.role, Math.max(pack.maxZoom, highest.get(pack.role) ?? -1))
      }
    }
    return packs.map((pack) => {
      const covered = !!pack.role && pack.maxZoom !== undefined && pack.maxZoom < (highest.get(pack.role) ?? -1)
      return { ...pack, covered, additionalDownloadBytes: pack.installed || covered ? 0 : pack.downloadBytes }
    })
  }

  async localElevationArchives(): Promise<LocalElevationArchive[]> {
    if (!worldOfflineEnabled()) return []
    const installed = (await this.localPacks('elevation')).filter((pack) => pack.installed)
      .sort((a, b) => (b.maxZoom ?? -1) - (a.maxZoom ?? -1))[0]
    return (installed?.archives ?? []).filter((archive) => archive.encoding === 'terrarium'
      && archive.format === 'webp' && archive.tileSize === 512
      && archive.maxzoom >= 6 && archive.maxzoom <= 12
      && archive.minzoom === (archive.maxzoom === 6 ? 0 : archive.maxzoom))
      .map((archive) => ({ path: join(packDirectory(), archive.filename), archive }))
  }

  async managedFiles(): Promise<Set<string>> {
    if (!worldOfflineEnabled()) return new Set()
    const [catalog, owned] = await Promise.all([this.catalog(), this.manifest().catch(() => undefined)])
    return new Set(catalog.flatMap(({ id, files }) => {
      const records = owned?.[id]
      if (!Array.isArray(records)) return []
      return files.filter((filename) => records.some((record) => isManagedArchive(record, filename)))
    }))
  }

  private async worker(path = '', body?: Record<string, unknown>): Promise<Partial<WorldInventory> & WorkerReply> {
    const url = env.get('WORLD_OFFLINE_WORKER_URL')
    const token = env.get('WORLD_OFFLINE_WORKER_TOKEN')
    if (!worldOfflineEnabled() || !url || !token) {
      throw new WorldOfflineError(503, 'Map preparation service is unavailable.')
    }
    try {
      const response = await fetch(new URL('/api/lab-imagery/world' + path, url), {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Nomad-Lab-Token': token },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(body ? 12_000 : 2_000),
        redirect: 'error',
      })
      const raw: unknown = await response.json()
      const result = raw && typeof raw === 'object'
        ? raw as Partial<WorldInventory> & WorkerReply : {}
      if (!response.ok) {
        const status = [400, 403, 404, 409, 422, 507].includes(response.status) ? response.status : 503
        throw new WorldOfflineError(status, typeof result?.message === 'string' ? result.message : 'Map operation failed.')
      }
      return result
    } catch (error) {
      if (error instanceof WorldOfflineError) throw error
      throw new WorldOfflineError(503, 'Map preparation service is unavailable. Try again shortly.')
    }
  }

  async connectedInventory(): Promise<WorldInventory> {
    const result = await this.worker()
    if (!Array.isArray(result?.packs)) throw new WorldOfflineError(503, 'Map inventory is unavailable.')
    return identifyInventory({ ...result, packs: result.packs, job: result.job ?? null })
  }

  async inventory(): Promise<WorldInventory> {
    try {
      return await this.connectedInventory()
    } catch {
      return identifyInventory({ packs: await this.localPacks().catch(() => []), job: null, serviceUnavailable: true })
    }
  }

  async control(action: WorkerAction, payload: Record<string, unknown>): Promise<WorkerReply> {
    return this.worker('/' + action, payload)
  }
}
