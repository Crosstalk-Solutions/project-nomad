import type { CatalogResult } from '../services/kiwix_catalog_service.js'
import type { SpecResource } from '../../types/collections.js'
import { isGatedResource } from './hosted_content.js'

export type ResolvedZimDownload = {
  url: string
  version: string
  sizeBytes: number | undefined
}

function compareZimVersions(left: string, right: string): number {
  const parse = (value: string): [number, number] | null => {
    const match = /^(\d{4})-(\d{1,2})$/.exec(value)
    if (!match) return null

    const month = Number.parseInt(match[2], 10)
    if (month < 1 || month > 12) return null

    return [Number.parseInt(match[1], 10), month]
  }

  const leftParts = parse(left)
  const rightParts = parse(right)
  if (!leftParts || !rightParts) return left.localeCompare(right)

  return leftParts[0] - rightParts[0] || leftParts[1] - rightParts[1]
}

export function resolveZimDownload(
  resource: SpecResource,
  latest: CatalogResult | null
): ResolvedZimDownload {
  const manifestSizeBytes = resource.size_mb > 0 ? resource.size_mb * 1024 * 1024 : undefined

  // Content we host ourselves is pinned to the manifest URL, never the Kiwix
  // catalog. It isn't in the openzim catalog at all, so this is normally a no-op
  // — but a resource-id collision would otherwise silently redirect a gated
  // download to a third-party mirror, losing both the auth header and any
  // guarantee about what the bytes are.
  //
  // Consequence, stated rather than implied: gated content does NOT participate
  // in catalog-driven auto-update. New versions ship by bumping the manifest.
  if (isGatedResource(resource)) {
    return {
      url: resource.url,
      version: resource.version,
      sizeBytes: manifestSizeBytes,
    }
  }

  if (!latest || compareZimVersions(latest.version, resource.version) < 0) {
    return {
      url: resource.url,
      version: resource.version,
      sizeBytes: manifestSizeBytes,
    }
  }

  return {
    url: latest.download_url,
    version: latest.version,
    sizeBytes: latest.size_bytes > 0 ? latest.size_bytes : manifestSizeBytes,
  }
}
