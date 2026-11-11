import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MapRegionInstalledComponent, MapRegionUpdateState } from '../../types/map_regions.js'
import { assertMapRegionSourceUrl, assertMapRegionRequestUrl } from '../utils/map_region_catalog.js'

export interface SourceProbe {
  size?: number
  lastModified?: string
  etag?: string
  md5?: string
}

/** Small provider metadata requests only. Never fetches the PBF/ZIP body. */
export class MapRegionUpdateService {
  private probes = new Map<string, Promise<SourceProbe>>()
  private digests = new Map<string, Promise<string>>()
  private deadline = Date.now() + 60000
  constructor(readonly root: string) {}
  private async request(url: string, provider: 'geofabrik' | 'ibge-cnefe', checksum = false) {
    // The catalog/start URL is canonical; only explicit supported destinations
    // may be followed after that provider responds with a redirect.
    if (checksum) assertMapRegionRequestUrl(url, provider, 'checksum')
    else assertMapRegionSourceUrl(url, provider)
    const signal = AbortSignal.timeout(10000)
    for (let redirects = 0; redirects < 6; redirects++) {
      assertMapRegionRequestUrl(url, provider, checksum ? 'checksum' : 'data')
      const response = await fetch(url, {
        method: checksum ? 'GET' : 'HEAD',
        redirect: 'manual',
        signal,
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) throw new Error('Public source returned an invalid redirect')
        url = new URL(location, url).toString()
        continue
      }
      if (checksum && response.status === 404) return undefined
      if (!response.ok) throw new Error('Public source returned HTTP ' + response.status)
      return { response, url }
    }
    throw new Error('Public source redirected too many times')
  }
  private probe(item: MapRegionInstalledComponent) {
    const key = item.source.sourceId + '|' + item.source.url
    if (!this.probes.has(key))
      this.probes.set(
        key,
        (async () => {
          const head = await this.request(item.source.url, item.source.sourceId)
          if (!head) throw new Error('Public source metadata is unavailable')
          const { response } = head
          const size = Number(response.headers.get('content-length'))
          const result: SourceProbe = {
            size: Number.isSafeInteger(size) && size > 0 ? size : undefined,
            lastModified: response.headers.get('last-modified') || undefined,
            etag: response.headers.get('etag') || undefined,
          }
          if (item.source.sourceId === 'geofabrik') {
            try {
              // A mirror can lag the canonical latest URL. Pair its metadata
              // with its own checksum instead of comparing different snapshots.
              const resultChecksum = await this.request(head.url + '.md5', 'geofabrik', true)
              const checksum = resultChecksum?.response
              if (checksum) {
                if (Number(checksum.headers.get('content-length')) > 4096)
                  throw new Error('Checksum response too large')
                let text = ''
                for await (const chunk of checksum.body as unknown as AsyncIterable<Uint8Array>) {
                  text += Buffer.from(chunk).toString('utf8')
                  if (text.length > 4096) {
                    await checksum.body?.cancel().catch(() => {})
                    throw new Error('Checksum response too large')
                  }
                }
                result.md5 = /^\s*([a-f0-9]{32})(?:\s|$)/i.exec(text)?.[1].toLowerCase()
              }
            } catch {
              /* HEAD metadata remains useful when an optional MD5 is absent. */
            }
          }
          return result
        })()
      )
    return this.probes.get(key)!
  }
  async check(item: MapRegionInstalledComponent): Promise<MapRegionUpdateState> {
    const checkedAt = new Date().toISOString()
    try {
      if (
        Date.now() > this.deadline &&
        !this.probes.has(item.source.sourceId + '|' + item.source.url)
      )
        return {
          status: 'unknown',
          checkedAt,
          error: 'The check time limit was reached. Check individual regions to continue.',
        }
      const remote = await this.probe(item)
      const source = join(
        this.root,
        'sources',
        item.regionId,
        item.source.sha256,
        item.source.format === 'osm-pbf' ? 'source.osm.pbf' : 'source.zip'
      )
      const cache = await readFile(
        join(this.root, 'sources', item.regionId, 'current.json'),
        'utf8'
      )
        .then(JSON.parse)
        .catch(() => null)
      const matching = cache?.sha256 === item.source.sha256 ? cache : undefined
      const localSize =
        item.source.sizeBytes ||
        matching?.size ||
        (await stat(source)
          .then((s) => s.size)
          .catch(() => undefined))
      if (remote.md5) {
        if (!this.digests.has(item.source.sha256))
          this.digests.set(
            item.source.sha256,
            (async () => {
              const memo = join(this.root, 'updates', 'source-checks', item.source.sha256 + '.json')
              let localMd5 = await readFile(memo, 'utf8')
                .then(JSON.parse)
                .then((value) => value.md5 as string)
                .catch(() => undefined)
              if (!localMd5) {
                const hash = createHash('md5')
                for await (const chunk of createReadStream(source)) {
                  if (Date.now() > this.deadline)
                    throw new Error('The local checksum check time limit was reached')
                  hash.update(chunk)
                }
                localMd5 = hash.digest('hex')
                await mkdir(join(this.root, 'updates', 'source-checks'), { recursive: true })
                const temporary = memo + '.' + Math.random().toString(36).slice(2) + '.tmp'
                await writeFile(temporary, JSON.stringify({ md5: localMd5 }))
                await rename(temporary, memo)
              }
              return localMd5
            })()
          )
        const localMd5 = await this.digests.get(item.source.sha256)!
        return {
          status: localMd5 === remote.md5 ? 'up_to_date' : 'available',
          checkedAt,
          sourceDate: remote.lastModified,
          remoteChecksum: remote.md5,
          evidence: 'checksum',
        }
      }
      const previousDate = item.source.lastModified || matching?.lastModified
      const previousTag = item.source.etag || matching?.etag
      if (
        (remote.etag && previousTag && remote.etag === previousTag) ||
        (remote.lastModified &&
          previousDate &&
          remote.lastModified === previousDate &&
          remote.size !== undefined &&
          localSize === remote.size)
      )
        return {
          status: 'up_to_date',
          checkedAt,
          sourceDate: remote.lastModified,
          evidence: 'metadata',
        }
      if (
        (remote.etag && previousTag && remote.etag !== previousTag) ||
        (remote.lastModified && previousDate && remote.lastModified !== previousDate) ||
        (remote.size !== undefined && localSize !== undefined && remote.size !== localSize)
      )
        return {
          status: 'available',
          checkedAt,
          sourceDate: remote.lastModified,
          evidence: 'metadata',
        }
      return {
        status: 'unknown',
        checkedAt,
        sourceDate: remote.lastModified,
        error: 'The provider does not expose enough comparable metadata.',
      }
    } catch (error) {
      return {
        status: 'unavailable',
        checkedAt,
        error:
          'Could not verify the public source. Installed data remains usable. ' +
          (error as Error).message,
      }
    }
  }
}
