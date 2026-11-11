import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { MapPackManifest, MapPackState, MapPackStatus } from '../../types/map_packs.js'
import { downloadMapPackArtifact, verifyMapPackArtifact } from './map_pack_download.js'
import {
  MapPackError,
  mapPackId,
  parseMapPackCatalog,
  parseMapPackManifest,
} from './map_pack_manifest.js'

interface InstallRecord {
  manifest: MapPackManifest
  status: MapPackStatus
  progress?: number
  error?: string
}

// Controllers are injected per request. Share a lock across their service instances
// so activate/uninstall cannot race between their asynchronous filesystem checks.
const mutations = new Map<string, Promise<void>>()

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function atomicJson(path: string, data: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2), { flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

/** File-backed storage shared by HTTP and BullMQ processes, independent of Adonis/Redis. */
export class MapPackStore {
  readonly root: string

  constructor(
    root: string,
    readonly catalogPath: string,
    readonly allowLocalDownloads = false
  ) {
    this.root = resolve(root)
  }

  async catalog(): Promise<MapPackManifest[]> {
    try {
      return parseMapPackCatalog(await readJson(this.catalogPath)).packages
    } catch (error) {
      if (isMissing(error)) return []
      throw new MapPackError(`Cannot read map package catalog: ${(error as Error).message}`, 503)
    }
  }

  async catalogPackage(id: unknown): Promise<MapPackManifest> {
    const safeId = mapPackId(id)
    const catalog = await this.catalog()
    const manifest = catalog.find((p) => p.id === safeId)
    if (!manifest) throw new MapPackError('Package is not in the configured catalog', 404)
    return manifest
  }

  private recordPath(id: string) {
    return join(this.root, 'state', `${mapPackId(id)}.json`)
  }

  private installedPath(manifest: MapPackManifest) {
    // All callers use a parsed manifest; validating again keeps path safety local.
    const safe = parseMapPackManifest(manifest)
    return join(this.root, 'installed', safe.id, safe.version)
  }

  private async record(id: string): Promise<InstallRecord | null> {
    try {
      const value = (await readJson(this.recordPath(id))) as InstallRecord
      const manifest = parseMapPackManifest(value.manifest)
      if (manifest.id !== id) throw new Error('Package state ID does not match its filename')
      const statuses: MapPackStatus[] = [
        'available',
        'downloading',
        'verifying',
        'installed',
        'active',
        'failed',
      ]
      if (!statuses.includes(value.status)) throw new Error('Invalid package install state')
      return {
        manifest,
        status: value.status,
        ...(typeof value.progress === 'number'
          ? { progress: Math.max(0, Math.min(100, value.progress)) }
          : {}),
        ...(typeof value.error === 'string' ? { error: value.error } : {}),
      }
    } catch (error) {
      if (isMissing(error)) return null
      throw new MapPackError(`Cannot read package state: ${(error as Error).message}`, 503)
    }
  }

  private async save(record: InstallRecord) {
    await mkdir(join(this.root, 'state'), { recursive: true })
    await atomicJson(this.recordPath(record.manifest.id), record)
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = mutations.get(this.root) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolveLock) => {
      release = resolveLock
    })
    mutations.set(this.root, current)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (mutations.get(this.root) === current) mutations.delete(this.root)
    }
  }

  async markQueued(manifest: MapPackManifest) {
    return this.queueInstall(manifest, async () => undefined)
  }

  /** Serialize queue publication with removal, including requests from other tabs. */
  async queueInstall<T>(manifest: MapPackManifest, dispatch: () => Promise<T>): Promise<T> {
    return this.mutate(async () => {
      await this.assertInstallable(manifest)
      const current = await this.record(manifest.id)
      if (current?.status !== 'downloading' && current?.status !== 'verifying') {
        await this.save({ manifest, status: 'downloading', progress: 0 })
      }
      try {
        return await dispatch()
      } catch (error) {
        await this.markFailed(manifest, error)
        throw error
      }
    })
  }

  /** In-place upgrades are not supported yet; never hide an installed graph behind a new download record. */
  private async assertInstallable(manifest: MapPackManifest) {
    const versions = await readdir(join(this.root, 'installed', mapPackId(manifest.id))).catch(
      (error) => {
        if (isMissing(error)) return [] as string[]
        throw error
      }
    )
    for (const version of versions) {
      if (version === manifest.version) continue
      if (await this.getInstalledPackage(manifest.id, version)) {
        throw new MapPackError(
          'A different version of this package is installed. Deactivate and remove it before installing the new version.',
          409
        )
      }
    }
  }

  async markFailed(manifest: MapPackManifest, error: unknown) {
    await this.save({
      manifest,
      status: 'failed',
      error: (error as Error).message || String(error),
    })
  }

  async failInstall(id: string, error: unknown) {
    const record = await this.record(mapPackId(id))
    if (record) await this.markFailed(record.manifest, error)
  }

  async getInstalledPackage(id: string, version?: string): Promise<MapPackManifest | null> {
    mapPackId(id)
    const selectedVersion = version ?? (await this.record(id))?.manifest.version
    if (!selectedVersion) return null
    // Parse before building a version-based path, even when state came from disk.
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(selectedVersion)) return null
    try {
      const manifest = parseMapPackManifest(
        await readJson(join(this.root, 'installed', id, selectedVersion, 'manifest.json'))
      )
      if (manifest.id !== id || manifest.version !== selectedVersion) return null
      const info = await stat(join(this.installedPath(manifest), 'routing.tar'))
      if (!info.isFile() || info.size !== manifest.routing.artifact.size_bytes) return null
      return manifest
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  getActiveRoutingPath() {
    return join(this.root, 'active', 'routing.tar')
  }

  async getActivePackage(): Promise<MapPackManifest | null> {
    try {
      const target = resolve(this.root, await readlink(join(this.root, 'active')))
      const manifest = parseMapPackManifest(await readJson(join(target, 'manifest.json')))
      if (target !== this.installedPath(manifest)) {
        throw new MapPackError('Active package points outside its installed directory', 503)
      }
      return await this.getInstalledPackage(manifest.id, manifest.version)
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async list(): Promise<{ packages: MapPackState[]; activePackageId: string | null }> {
    const catalog = await this.catalog()
    const manifests = new Map(catalog.map((p) => [p.id, p]))
    const files = await readdir(join(this.root, 'state')).catch((error) => {
      if (isMissing(error)) return [] as string[]
      throw error
    })
    for (const file of files) {
      if (!/^[a-z0-9][a-z0-9_-]*\.json$/.test(file)) continue
      const record = await this.record(file.slice(0, -5))
      if (record && !manifests.has(record.manifest.id))
        manifests.set(record.manifest.id, record.manifest)
    }
    const active = await this.getActivePackage()
    const packages: MapPackState[] = []
    for (const manifest of manifests.values()) {
      const record = await this.record(manifest.id)
      const installed = await this.getInstalledPackage(manifest.id)
      const selected = active?.id === manifest.id ? active : (installed ?? manifest)
      const busy = record?.status === 'downloading' || record?.status === 'verifying'
      const status: MapPackStatus =
        active?.id === manifest.id
          ? 'active'
          : busy
            ? record.status
            : installed
              ? 'installed'
              : record?.status === 'failed'
                ? 'failed'
                : 'available'
      packages.push({
        ...selected,
        status,
        ...(installed ? { installedVersion: installed.version } : {}),
        ...(busy && record.progress !== undefined ? { progress: record.progress } : {}),
        ...(status === 'failed' && record?.error ? { error: record.error } : {}),
      })
    }
    return { packages, activePackageId: active?.id ?? null }
  }

  /** Routing reads installed manifests, independent of the download catalog.
   * A damaged optional package must not disable other installed graphs. */
  async listInstalled(): Promise<MapPackState[]> {
    const active = await this.getActivePackage().catch((error) => {
      console.warn('Cannot read the active imported map package.', (error as Error).message)
      return null
    })
    const packages: MapPackState[] = active ? [{ ...active, status: 'active' }] : []
    const files = await readdir(join(this.root, 'state')).catch((error) => {
      if (!isMissing(error))
        console.warn('Cannot read imported map package state.', (error as Error).message)
      return [] as string[]
    })
    for (const file of files) {
      if (!/^[a-z0-9][a-z0-9_-]{0,79}\.json$/.test(file)) continue
      const id = file.slice(0, -5)
      if (id === active?.id) continue
      try {
        const manifest = await this.getInstalledPackage(id)
        if (manifest) packages.push({ ...manifest, status: 'installed' })
      } catch (error) {
        console.warn(`Cannot read imported map package ${id}.`, (error as Error).message)
      }
    }
    return packages
  }

  /** Worker entrypoint. Partial files survive transient failures; verified files publish atomically. */
  async install(
    id: string,
    expectedVersion?: string,
    onProgress?: (progress: number) => Promise<void>
  ) {
    const manifest = await this.catalogPackage(id)
    if (expectedVersion && expectedVersion !== manifest.version) {
      throw new MapPackError('Catalog changed after this download was queued; please retry', 409)
    }
    await this.assertInstallable(manifest)
    const alreadyInstalled = await this.getInstalledPackage(id, manifest.version)
    if (alreadyInstalled) {
      await this.save({ manifest: alreadyInstalled, status: 'installed', progress: 100 })
      return alreadyInstalled
    }
    const staging = join(this.root, 'staging', manifest.id, manifest.version)
    const partial = join(staging, 'routing.tar.part')
    await mkdir(staging, { recursive: true })
    let lastSaved = 0
    try {
      await this.save({ manifest, status: 'downloading', progress: 0 })
      await downloadMapPackArtifact(manifest.routing.artifact, partial, {
        allowLocal: this.allowLocalDownloads,
        onProgress: async (bytes) => {
          if (Date.now() - lastSaved < 1000) return
          lastSaved = Date.now()
          const progress = Math.min(
            99,
            Math.floor((bytes / manifest.routing.artifact.size_bytes) * 100)
          )
          await this.save({ manifest, status: 'downloading', progress })
          await onProgress?.(progress)
        },
      })
      await this.save({ manifest, status: 'verifying', progress: 99 })
      await verifyMapPackArtifact(partial, manifest.routing.artifact)
      await rename(partial, join(staging, 'routing.tar'))
      await atomicJson(join(staging, 'manifest.json'), manifest)
      const destination = this.installedPath(manifest)
      await mkdir(join(this.root, 'installed', manifest.id), { recursive: true })
      await rename(staging, destination)
      await this.save({ manifest, status: 'installed', progress: 100 })
      await onProgress?.(100)
      return manifest
    } catch (error) {
      // A complete corrupt partial cannot resume; force a clean download on retry.
      if (error instanceof MapPackError && error.status === 422) await rm(partial, { force: true })
      await this.markFailed(manifest, error)
      throw error
    }
  }

  /** The old symlink remains valid if validation or the atomic rename fails. */
  async activate(id: unknown) {
    return this.mutate(async () => this.activatePackage(id))
  }

  private async activatePackage(id: unknown) {
    const safeId = mapPackId(id)
    const record = await this.record(safeId)
    if (record?.status === 'downloading' || record?.status === 'verifying') {
      throw new MapPackError('Wait for the package download to finish before activating it', 409)
    }
    const manifest = await this.getInstalledPackage(safeId)
    if (!manifest)
      throw new MapPackError('Package is not installed or its artifact is incomplete', 409)
    await mkdir(this.root, { recursive: true })
    const temporary = join(this.root, `.active-${randomUUID()}`)
    try {
      await symlink(join('installed', manifest.id, manifest.version), temporary, 'dir')
      await rename(temporary, join(this.root, 'active'))
    } finally {
      await rm(temporary, { force: true })
    }
    return manifest
  }

  async uninstall(id: unknown, cancelPendingDownload?: () => Promise<boolean>) {
    return this.mutate(async () => this.uninstallPackage(id, cancelPendingDownload))
  }

  private async uninstallPackage(id: unknown, cancelPendingDownload?: () => Promise<boolean>) {
    const safeId = mapPackId(id)
    const active = await this.getActivePackage()
    if (active?.id === safeId)
      throw new MapPackError('Activate another package before removing the active package', 409)
    const record = await this.record(safeId)
    // Hold the same HTTP-process lock used by markQueued until the job has been
    // removed and the files have gone. BullMQ refuses removal of a running job.
    const cancelled = (await cancelPendingDownload?.()) ?? false
    if (!cancelled && (record?.status === 'downloading' || record?.status === 'verifying')) {
      throw new MapPackError('A package cannot be removed while its download is running', 409)
    }
    await rm(join(this.root, 'installed', safeId), { recursive: true, force: true })
    await rm(join(this.root, 'staging', safeId), { recursive: true, force: true })
    await rm(this.recordPath(safeId), { force: true })
  }

  async deactivate() {
    return this.mutate(async () => {
      // unlink is atomic; installed graphs and in-progress downloads are untouched.
      await rm(join(this.root, 'active'), { force: true })
    })
  }
}
