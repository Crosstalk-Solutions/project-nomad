import type { CatalogResult } from '../services/kiwix_catalog_service.js'
import type { SpecResource } from '../../types/collections.js'

export type ResolvedZimDownload = {
  url: string
  version: string
  sizeBytes: number | undefined
}

export function resolveZimDownload(
  resource: SpecResource,
  latest: CatalogResult | null
): ResolvedZimDownload {
  const manifestSizeBytes = resource.size_mb > 0 ? resource.size_mb * 1024 * 1024 : undefined

  if (!latest || latest.version < resource.version) {
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
