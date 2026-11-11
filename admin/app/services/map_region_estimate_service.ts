import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MapRegionService, regionAtomicJson } from './map_region_service.js'
import {
  mapRegionComponents,
  assertMapRegionSourceUrl,
  assertMapRegionRequestUrl,
} from '../utils/map_region_catalog.js'
import { assertInstallableTerritory } from '../utils/map_region_territory.js'
import { regionProvider } from '../utils/map_region_availability.js'
import { mapRegionCapacity, mapRegionPreparationRequirement } from '../utils/map_region_capacity.js'
import type {
  MapRegionComponent,
  MapRegionDefinition,
  MapRegionSource,
} from '../../types/map_regions.js'

type SourceMetadata = {
  url: string
  resolvedUrl: string
  bytes?: number
  lastModified?: string
  etag?: string
  checkedAt: string
  error?: string
}
export interface MapRegionEstimate {
  regionId: string
  components: MapRegionComponent[]
  operation: 'install' | 'update'
  collection: boolean
  packages: number
  totalSourceBytes?: number
  remainingDownloadBytes?: number
  reusableBytes: number
  minimumFreeBytes?: number
  availableFreeBytes?: number
  spaceSufficient?: boolean
  diskCheckError?: string
  complete: boolean
  checkedAt: string
  sources: {
    url: string
    regionId: string
    bytes?: number
    cachedBytes: number
    status: 'known' | 'unknown'
    checkedAt?: string
    stale?: boolean
    message?: string
  }[]
  message?: string
}
const reads = new Map<string, Promise<SourceMetadata>>()
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

/** A preview reads small, bounded provider metadata; never fetches datasets. */
export class MapRegionEstimateService {
  constructor(readonly service = new MapRegionService()) {}
  private async localMetadata(
    region: MapRegionDefinition,
    source: MapRegionSource
  ): Promise<SourceMetadata | undefined> {
    assertMapRegionSourceUrl(source.url, source.sourceId)
    const directory = join(this.service.root, 'sources', region.id)
    const current = await json(join(directory, 'current.json')).catch(() => undefined)
    if (
      current?.url !== source.url ||
      !/^[a-f0-9]{64}$/.test(current.sha256 || '') ||
      !Number.isSafeInteger(current.size) ||
      current.size <= 0
    )
      return
    const path = join(
      directory,
      current.sha256,
      source.format === 'osm-pbf' ? 'source.osm.pbf' : 'source.zip'
    )
    const info = await stat(path).catch(() => undefined)
    if (
      !info?.isFile() ||
      info.size !== current.size ||
      (await realpath(path).catch(() => '')) !== path
    )
      return
    // Preview only: avoid reading/hash-scanning a large local source or asking
    // its provider. The install operation validates its checksum before use.
    return {
      url: source.url,
      resolvedUrl: source.url,
      bytes: info.size,
      lastModified: typeof current.lastModified === 'string' ? current.lastModified : '',
      checkedAt: Number.isFinite(Date.parse(current.downloadedAt))
        ? new Date(current.downloadedAt).toISOString()
        : info.mtime.toISOString(),
    }
  }
  private async metadata(source: MapRegionSource): Promise<SourceMetadata> {
    assertMapRegionSourceUrl(source.url, source.sourceId)
    const path = join(
      this.service.root,
      'estimates',
      createHash('sha256').update(source.url).digest('hex') + '.json'
    )
    const saved = await json(path).catch(() => undefined)
    const cached: SourceMetadata | undefined =
      saved?.url === source.url &&
      typeof saved.checkedAt === 'string' &&
      Number.isFinite(Date.parse(saved.checkedAt)) &&
      (saved.bytes === undefined || (Number.isSafeInteger(saved.bytes) && saved.bytes > 0))
        ? saved
        : undefined
    if (cached?.url === source.url && Date.now() - Date.parse(cached.checkedAt) < 3600_000)
      return cached
    const key = this.service.root + '|' + source.url
    let pending = reads.get(key)
    if (!pending) {
      pending = (async () => {
        try {
          let url = source.url
          const signal = AbortSignal.timeout(8000)
          for (let redirects = 0; redirects < 6; redirects++) {
            assertMapRegionRequestUrl(url, source.sourceId)
            const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal })
            await response.body?.cancel()
            if (response.status >= 300 && response.status < 400) {
              const location = response.headers.get('location')
              if (!location) throw new Error('The source returned an invalid redirect')
              url = new URL(location, url).toString()
              continue
            }
            if (!response.ok) throw new Error('The source returned HTTP ' + response.status)
            const bytes = Number(response.headers.get('content-length'))
            const value: SourceMetadata = {
              url: source.url,
              resolvedUrl: url,
              bytes: Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined,
              lastModified: response.headers.get('last-modified') || undefined,
              etag: response.headers.get('etag') || undefined,
              checkedAt: new Date().toISOString(),
            }
            if (!value.bytes) value.error = 'The provider does not report a reliable download size.'
            await regionAtomicJson(path, value)
            return value
          }
          throw new Error('Too many source redirects')
        } catch (error) {
          if (cached?.url === source.url && cached.bytes)
            return {
              ...cached,
              error: 'Offline or unavailable: showing the last known source size.',
            }
          return {
            url: source.url,
            resolvedUrl: source.url,
            checkedAt: new Date().toISOString(),
            error: (error as Error).message,
          }
        }
      })()
      reads.set(key, pending)
      void pending.finally(() => {
        if (reads.get(key) === pending) reads.delete(key)
      })
    }
    return pending
  }
  private async reusable(
    region: MapRegionDefinition,
    source: MapRegionSource,
    metadata: SourceMetadata
  ) {
    if (!metadata.bytes || metadata.error) return 0
    const directory = join(this.service.root, 'sources', region.id)
    const current = await json(join(directory, 'current.json')).catch(() => null)
    if (
      current?.url === source.url &&
      current.size === metadata.bytes &&
      current.lastModified === (metadata.lastModified || '') &&
      /^[a-f0-9]{64}$/.test(current.sha256)
    ) {
      const cached = join(
        directory,
        current.sha256,
        source.format === 'osm-pbf' ? 'source.osm.pbf' : 'source.zip'
      )
      if (
        await stat(cached)
          .then((info) => info.isFile() && info.size === metadata.bytes)
          .catch(() => false)
      )
        return metadata.bytes
    }
    const partial = await json(join(directory, 'download.json')).catch(() => null)
    if (
      partial?.url === metadata.resolvedUrl &&
      partial.size === metadata.bytes &&
      partial.lastModified === (metadata.lastModified || '')
    ) {
      const bytes = await stat(join(directory, 'download.part'))
        .then((info) => (info.isFile() ? info.size : 0))
        .catch(() => 0)
      if (bytes >= 0 && bytes <= metadata.bytes) return bytes
    }
    return 0
  }
  async estimate(
    id: unknown,
    components: MapRegionComponent[],
    operation: 'install' | 'update' = 'install'
  ): Promise<MapRegionEstimate> {
    components = mapRegionComponents(components)
    const region = await this.service.region(id)
    assertInstallableTerritory(region)
    const catalog = await this.service.catalog()
    const installed = await this.service.listInstalledComponents()
    const selected = new Map<string, { region: MapRegionDefinition; source: MapRegionSource }>()
    const byParent = new Map<string, MapRegionDefinition[]>()
    for (const item of catalog.regions) {
      const children = byParent.get(item.parentId || '') || []
      children.push(item)
      byParent.set(item.parentId || '', children)
    }
    const collect = async (item: MapRegionDefinition, component: MapRegionComponent) => {
      if (operation === 'install' && regionProvider(item, component, catalog.regions, installed))
        return
      // Pending coverage needs no second transfer. No readiness is inferred.
      if (
        operation === 'install' &&
        (await this.service.resolvePendingProvider(item.id, component))
      )
        return
      const source = item.sources[component]
      if (source) selected.set(source.sourceId + '|' + source.url, { region: item, source })
      else for (const child of byParent.get(item.id) || []) await collect(child, component)
    }
    for (const component of components) await collect(region, component)
    const sources: MapRegionEstimate['sources'] = []
    const inputs = [...selected.values()]
    // Collections choose outermost published packages, never every descendant.
    for (let offset = 0; offset < inputs.length; offset += 4) {
      const batch = await Promise.all(
        inputs.slice(offset, offset + 4).map(async (input) => {
          const local =
            operation === 'install'
              ? await this.localMetadata(input.region, input.source)
              : undefined
          const metadata = local || (await this.metadata(input.source))
          const cachedBytes = await this.reusable(input.region, input.source, metadata)
          return {
            url: input.source.url,
            regionId: input.region.id,
            bytes: metadata.bytes,
            cachedBytes,
            status: metadata.bytes ? ('known' as const) : ('unknown' as const),
            checkedAt: metadata.checkedAt,
            stale: !!metadata.error,
            message: local
              ? 'Local cached source. Its checksum is verified before preparation.'
              : metadata.error,
          }
        })
      )
      sources.push(...batch)
    }
    const complete = sources.every((source) => source.bytes !== undefined)
    const total = complete ? sources.reduce((sum, source) => sum + source.bytes!, 0) : undefined
    const reusableBytes = sources.reduce((sum, source) => sum + source.cachedBytes, 0)
    const minimumFreeBytes =
      total === undefined
        ? undefined
        : total
          ? mapRegionPreparationRequirement(
              sources.map((source) => ({
                size: source.bytes!,
                format: inputs.find((input) => input.source.url === source.url)!.source.format,
              }))
            )
          : 0
    let availableFreeBytes: number | undefined
    let diskCheckError: string | undefined
    try {
      availableFreeBytes = (await mapRegionCapacity(this.service.root)).availableBytes
    } catch (error) {
      diskCheckError = (error as Error).message
    }
    return {
      regionId: region.id,
      components,
      operation,
      collection: !Object.keys(region.sources).length,
      packages: new Set(inputs.map((input) => input.region.id)).size,
      totalSourceBytes: total,
      remainingDownloadBytes: total === undefined ? undefined : Math.max(0, total - reusableBytes),
      reusableBytes,
      minimumFreeBytes,
      availableFreeBytes,
      spaceSufficient:
        minimumFreeBytes === undefined || availableFreeBytes === undefined
          ? undefined
          : availableFreeBytes >= minimumFreeBytes,
      diskCheckError,
      complete,
      checkedAt: sources.length
        ? new Date(
            Math.min(...sources.map((source) => Date.parse(source.checkedAt!)))
          ).toISOString()
        : new Date().toISOString(),
      sources,
      message: !Object.keys(region.sources).length
        ? 'Collection preview: outermost published packages, counted once. Optional provider supplements are separate. Independent graphs are not combined.'
        : !sources.length
          ? 'Selected components are already installed or included in an ancestor operation; no duplicate source transfer is needed.'
          : !complete
            ? 'Some source sizes are unavailable; remaining transfer and preparation space cannot be confirmed.'
            : sources.length > 0 && sources.every((source) => source.cachedBytes === source.bytes)
              ? 'The selected source files are already on this NOMAD. No internet download is needed. Integrity is verified before preparation.'
              : sources.some((source) => source.stale)
                ? 'Some sizes are last-known metadata. Recheck online before a large download.'
                : 'Source transfer only. Final installed size varies. Cached bytes are reused after verification; preparation free-space requirement is conservative.',
    }
  }
}
