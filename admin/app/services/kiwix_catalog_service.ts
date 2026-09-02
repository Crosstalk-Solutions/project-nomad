import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import InstalledResource from '#models/installed_resource'
import { isRawListRemoteZimFilesResponse } from '../../util/zim.js'

/**
 * Local, in-process freshness check for installed content (Kiwix ZIM files +
 * PMTiles maps). This replaces the former dependency on the external
 * project-nomad-api `/api/v1/resources/check-updates` endpoint — every NOMAD
 * instance now queries the upstream catalogs directly.
 *
 * Downloads have always gone straight to the Kiwix/GitHub mirrors regardless of
 * who performed the check, so moving the check in-process only shifts the
 * lightweight *catalog* lookup. To stay mirror-respectful the auto-updater gates
 * these calls behind the update window and bounds their concurrency; sizes come
 * from the catalog metadata so we avoid per-file HEAD requests.
 *
 * Robustness over the old API: ZIM lookups use the OPDS exact `name=` filter
 * (no lossy keyword stripping) and every returned link is still validated
 * against the authoritative `^<id>_YYYY-MM\.zim$` filename regex, so a substring
 * match in the catalog can never resolve to the wrong book. Parsing is fully
 * defensive — a malformed entry is skipped, never thrown.
 */

const KIWIX_CATALOG_URL = 'https://browse.library.kiwix.org/catalog/v2/entries'
const GITHUB_PMTILES_URL =
  'https://api.github.com/repos/Crosstalk-Solutions/project-nomad-maps/contents/pmtiles'

const CATALOG_TIMEOUT_MS = 15000
/** Bounded paginated fallback scan when the exact `name=` lookup comes up empty. */
const KIWIX_PAGE_SIZE = 60
const MAX_KIWIX_FETCHES = 5
/** Concurrent ZIM catalog lookups — keep small to avoid hammering the mirror. */
const ZIM_CHECK_CONCURRENCY = 4

/** The newest available version of a single resource (a YYYY-MM date stamp). */
export interface CatalogResult {
  version: string
  download_url: string
  size_bytes: number
}

interface CatalogZimEntry {
  name: string | null
  download_url: string
  file_name: string
  size_bytes: number
}

interface GithubContentEntry {
  name: string
  download_url: string | null
  size: number
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class KiwixCatalogService {
  private parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
  })

  /**
   * Resolve the newest available version for a batch of installed resources.
   * Returns a map keyed by `"<resource_type>:<resource_id>"`; resources with no
   * available newer version (or a failed lookup) are simply absent.
   *
   * ZIMs are checked one OPDS request each (bounded concurrency). All maps are
   * resolved from a single GitHub directory listing.
   */
  async getLatestForResources(
    resources: Array<{ resource_id: string; resource_type: 'zim' | 'map' }>
  ): Promise<Map<string, CatalogResult>> {
    const result = new Map<string, CatalogResult>()
    const zims = resources.filter((r) => r.resource_type === 'zim')
    const maps = resources.filter((r) => r.resource_type === 'map')

    await this.forEachWithConcurrency(zims, ZIM_CHECK_CONCURRENCY, async (r) => {
      try {
        const latest = await this.getLatestZim(r.resource_id)
        if (latest) result.set(`zim:${r.resource_id}`, latest)
      } catch (error) {
        logger.warn(
          `[KiwixCatalogService] ZIM check failed for ${r.resource_id}: ${error instanceof Error ? error.message : error}`
        )
      }
    })

    if (maps.length > 0) {
      try {
        const listing = await this.fetchMapListing()
        for (const r of maps) {
          const latest = this.pickNewestMap(listing, r.resource_id)
          if (latest) result.set(`map:${r.resource_id}`, latest)
        }
      } catch (error) {
        logger.warn(
          `[KiwixCatalogService] Map listing fetch failed: ${error instanceof Error ? error.message : error}`
        )
      }
    }

    return result
  }

  /** Newest catalog version of a single ZIM book, or null if none/older. */
  async getLatestZim(resourceId: string): Promise<CatalogResult | null> {
    const pattern = new RegExp(`^${escapeRegex(resourceId)}_(\\d{4}-\\d{2})\\.zim$`)

    // 1. Exact-name lookup (the robust path).
    const named = await this.fetchZimEntries({ name: resourceId, count: 50, start: 0 })
    const exact = this.pickNewestZim(named, pattern)
    if (exact) return exact

    // 2. Fallback: bounded keyword scan in case the catalog ignored `name=` or
    //    indexes the book under a slightly different name.
    return this.scanZimByQuery(resourceId, pattern)
  }

  /** Newest catalog version of a single PMTiles map, or null if none/older. */
  async getLatestMap(resourceId: string): Promise<CatalogResult | null> {
    const listing = await this.fetchMapListing()
    return this.pickNewestMap(listing, resourceId)
  }

  // ── ZIM internals ───────────────────────────────────────────────────────────

  private pickNewestZim(entries: CatalogZimEntry[], pattern: RegExp): CatalogResult | null {
    let latest: CatalogResult | null = null
    for (const entry of entries) {
      const match = entry.file_name.match(pattern)
      if (!match) continue
      const version = match[1]
      if (!latest || version > latest.version) {
        latest = { version, download_url: entry.download_url, size_bytes: entry.size_bytes }
      }
    }
    return latest
  }

  private async scanZimByQuery(
    resourceId: string,
    pattern: RegExp
  ): Promise<CatalogResult | null> {
    let start = 0
    let total = 0
    let latest: CatalogResult | null = null

    for (let i = 0; i < MAX_KIWIX_FETCHES; i++) {
      const { entries, totalResults } = await this.fetchZimEntriesPage({
        q: resourceId,
        count: KIWIX_PAGE_SIZE,
        start,
      })
      total = totalResults
      if (entries.length === 0) break
      start += entries.length

      const candidate = this.pickNewestZim(entries, pattern)
      if (candidate && (!latest || candidate.version > latest.version)) {
        latest = candidate
      }
      if (start >= total) break
    }
    return latest
  }

  private async fetchZimEntries(params: {
    name?: string
    q?: string
    count: number
    start: number
  }): Promise<CatalogZimEntry[]> {
    const { entries } = await this.fetchZimEntriesPage(params)
    return entries
  }

  private async fetchZimEntriesPage(params: {
    name?: string
    q?: string
    count: number
    start: number
  }): Promise<{ entries: CatalogZimEntry[]; totalResults: number }> {
    const res = await axios.get(KIWIX_CATALOG_URL, {
      params: {
        start: params.start,
        count: params.count,
        lang: 'eng',
        ...(params.name ? { name: params.name } : {}),
        ...(params.q ? { q: params.q } : {}),
      },
      responseType: 'text',
      timeout: CATALOG_TIMEOUT_MS,
    })
    return this.parseZimEntries(res.data)
  }

  private parseZimEntries(xml: string): { entries: CatalogZimEntry[]; totalResults: number } {
    let parsed: any
    try {
      parsed = this.parser.parse(xml)
    } catch {
      return { entries: [], totalResults: 0 }
    }
    if (!isRawListRemoteZimFilesResponse(parsed)) {
      return { entries: [], totalResults: 0 }
    }

    const feed = parsed.feed
    const totalResults = Number(feed?.totalResults)
    const rawEntries = feed?.entry
      ? Array.isArray(feed.entry)
        ? feed.entry
        : [feed.entry]
      : []

    const entries: CatalogZimEntry[] = []
    for (const raw of rawEntries) {
      if (!raw || typeof raw !== 'object') continue
      const links = Array.isArray(raw.link) ? raw.link : raw.link ? [raw.link] : []
      const downloadLink = links.find(
        (link: any) =>
          link &&
          typeof link === 'object' &&
          link.type === 'application/x-zim' &&
          typeof link.href === 'string'
      )
      if (!downloadLink) continue

      // The OPDS href ends with `.meta4`; strip it to get the real .zim URL.
      const href: string = downloadLink.href
      const download_url = href.endsWith('.meta4') ? href.slice(0, -'.meta4'.length) : href
      const file_name = download_url.split('/').pop() || ''
      if (!file_name) continue

      const size_bytes = Number.parseInt(downloadLink.length, 10) || 0
      entries.push({
        name: typeof raw.name === 'string' ? raw.name : null,
        download_url,
        file_name,
        size_bytes,
      })
    }

    return { entries, totalResults: Number.isFinite(totalResults) ? totalResults : 0 }
  }

  // ── Map internals ────────────────────────────────────────────────────────────

  private async fetchMapListing(): Promise<GithubContentEntry[]> {
    const res = await axios.get(GITHUB_PMTILES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      timeout: CATALOG_TIMEOUT_MS,
    })
    return Array.isArray(res.data) ? res.data : []
  }

  private pickNewestMap(listing: GithubContentEntry[], resourceId: string): CatalogResult | null {
    const pattern = new RegExp(`^${escapeRegex(resourceId)}_(\\d{4}-\\d{2})\\.pmtiles$`)
    let latest: CatalogResult | null = null
    for (const file of listing) {
      if (!file || typeof file.name !== 'string' || !file.download_url) continue
      const match = file.name.match(pattern)
      if (!match) continue
      const version = match[1]
      if (!latest || version > latest.version) {
        latest = {
          version,
          download_url: file.download_url,
          size_bytes: typeof file.size === 'number' ? file.size : 0,
        }
      }
    }
    return latest
  }

  // ── Shared ───────────────────────────────────────────────────────────────────

  private async forEachWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    let cursor = 0
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        await worker(items[index])
      }
    })
    await Promise.all(runners)
  }
}

/**
 * Persist the latest-known available-update state onto an installed resource.
 * Shared by the manual check and the auto-updater so both keep the cool-off
 * anchor consistent.
 *
 * The first-seen anchor is reset **only** when the available version string
 * actually changes, so a manual "Check for updates" never resets the auto
 * cool-off clock. State is cleared entirely once the resource is current (the
 * update got installed, or the upstream release was withdrawn).
 */
export async function reconcileResourceUpdateState(
  resource: InstalledResource,
  latest: CatalogResult | null,
  now: DateTime
): Promise<void> {
  const hasUpdate = latest !== null && latest.version > resource.version

  if (hasUpdate) {
    if (resource.available_update_version !== latest!.version) {
      resource.available_update_version = latest!.version
      resource.available_update_first_seen_at = now
    }
    // Keep the cached size fresh even when the version is unchanged (the catalog
    // may report a size it lacked on a previous check).
    const size = latest!.size_bytes || null
    if (resource.available_update_size_bytes !== size) {
      resource.available_update_size_bytes = size
    }
  } else if (resource.available_update_version !== null) {
    resource.available_update_version = null
    resource.available_update_size_bytes = null
    resource.available_update_first_seen_at = null
  }

  if (resource.$isDirty) {
    await resource.save()
  }
}
