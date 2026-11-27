import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import {
  LOCAL_DETAIL_LEVELS, LOCAL_DETAIL_ROLES, isLocalDetailCoordinate, localDetailId, localDetailLabel,
  type LocalDetailCell, type LocalDetailCoordinate, type LocalDetailInventory,
} from '../../types/local_detail.js'
import type { LocalElevationArchive } from './world_elevation_service.js'

export const localDetailEnabled = () => env.get('LOCAL_DETAIL_ENABLED') ?? false
export const localDetailRoot = () => env.get('LOCAL_DETAIL_STORAGE_PATH') ?? app.makePath('storage', 'maps', 'local-detail')
const directory = () => join(localDetailRoot(), 'pmtiles')
const digest = /^[a-f0-9]{64}$/

export class LocalDetailError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export class LocalDetailService {
  async localCells(): Promise<LocalDetailCell[]> {
    if (!localDetailEnabled()) return []
    let manifest: { schemaVersion?: number; cells?: unknown[] }
    try { manifest = JSON.parse(await readFile(join(directory(), 'local-detail-manifest.json'), 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cells)) throw new Error('Invalid local-detail inventory')
    const ready: LocalDetailCell[] = [], used = new Set<string>()
    for (const value of manifest.cells) {
      const cell = value as LocalDetailCell
      if (!isLocalDetailCoordinate(cell) || cell.status !== 'ready' || cell.id !== localDetailId(cell)
          || used.has(cell.id) || !Array.isArray(cell.archives) || cell.archives.length !== 4) continue
      const roles = new Set(cell.archives.map((archive) => archive.role))
      if (!LOCAL_DETAIL_ROLES.every((role) => roles.has(role))) continue
      const verified = await Promise.all(cell.archives.map(async (archive) => {
        const filename = `partial-z8-${cell.x}-${cell.y}-${archive.role}.pmtiles`
        if (archive.filename !== filename || !digest.test(archive.sha256)
            || !Number.isSafeInteger(archive.installedBytes) || archive.installedBytes < 1
            || !Number.isInteger(archive.minzoom) || !Number.isInteger(archive.maxzoom)
            || archive.maxzoom !== LOCAL_DETAIL_LEVELS[archive.role]
            || !Array.isArray(archive.bounds) || archive.bounds.length !== 4 || !archive.bounds.every(Number.isFinite)) return false
        const stat = await lstat(join(directory(), filename)).catch(() => null)
        return !!stat?.isFile() && stat.size === archive.installedBytes
      }))
      if (verified.every(Boolean)) { used.add(cell.id); ready.push({ ...cell, label: localDetailLabel(cell),
        installedBytes: cell.archives.reduce((total, archive) => total + archive.installedBytes, 0) }) }
    }
    return ready
  }

  async localElevationArchives(): Promise<LocalElevationArchive[]> {
    return (await this.localCells()).flatMap(({ archives }) => archives
      .filter((archive) => archive.role === 'elevation' && archive.encoding === 'terrarium' && archive.format === 'webp')
      .map((archive) => ({ path: join(directory(), archive.filename), archive })))
  }

  private async cleanupPending(): Promise<LocalDetailCoordinate[]> {
    try {
      const manifest = JSON.parse(await readFile(join(directory(), 'local-detail-manifest.json'), 'utf8'))
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.pendingDeletes)) return []
      const used = new Set<string>()
      return manifest.pendingDeletes.filter((cell: unknown): cell is LocalDetailCoordinate => {
        if (!isLocalDetailCoordinate(cell) || used.has(localDetailId(cell))) return false
        used.add(localDetailId(cell)); return true
      }).map(({ x, y }: LocalDetailCoordinate) => ({ x, y }))
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }

  private async worker(action = '', payload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = env.get('LOCAL_DETAIL_WORKER_URL'), token = env.get('LOCAL_DETAIL_WORKER_TOKEN')
    if (!localDetailEnabled() || !url || !token) throw new LocalDetailError(503, 'The regional map downloader is unavailable.')
    try {
      const response = await fetch(new URL('/api/lab-imagery/local-detail' + action, url), {
        method: payload ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Nomad-Lab-Token': token },
        body: payload ? JSON.stringify(payload) : undefined, redirect: 'error',
        signal: AbortSignal.timeout(action === '/calculate' ? 180_000 : ['/delete', '/queue', '/cleanup'].includes(action) ? 90_000 : payload ? 12_000 : 2_000),
      })
      const result = await response.json() as Record<string, unknown>
      if (!response.ok) throw new LocalDetailError([400, 403, 404, 409, 422, 507].includes(response.status) ? response.status : 503,
        typeof result.message === 'string' ? result.message : 'The regional map operation failed.')
      return result
    } catch (error) {
      if (error instanceof LocalDetailError) throw error
      throw new LocalDetailError(503, 'The regional map downloader is unavailable. Installed squares remain usable offline.')
    }
  }

  async inventory(): Promise<LocalDetailInventory> {
    const cells = await this.localCells(), cleanupPending = await this.cleanupPending()
    const generation = createHash('sha256').update(cells.flatMap(({ archives }) =>
      archives.map(({ filename, sha256 }) => filename + ':' + sha256)).sort().join('|')).digest('hex')
    const base: LocalDetailInventory = { schemaVersion: 1, gridZoom: 8, levels: LOCAL_DETAIL_LEVELS, cells, job: null, generation, cleanupPending }
    try {
      const live = await this.worker()
      return { ...base, job: (live.job ?? null) as LocalDetailInventory['job'], freeBytes: live.freeBytes as number | undefined,
        queue: (live.queue ?? null) as LocalDetailInventory['queue'],
        temporaryStorage: live.temporaryStorage as LocalDetailInventory['temporaryStorage'] }
    } catch { return { ...base, serviceUnavailable: true } }
  }

  control(action: 'calculate' | 'download' | 'queue' | 'cancel' | 'retry' | 'delete' | 'recalculate' | 'cleanup', payload: Record<string, unknown>) {
    return this.worker('/' + action, payload)
  }
}
