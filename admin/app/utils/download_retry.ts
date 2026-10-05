import { dirname, join } from 'node:path'

import type { RunDownloadJobParams } from '../../types/downloads.js'
import type { ZimCategoriesSpec } from '../../types/collections.js'

/**
 * Params for retrying a failed download. A job's data is frozen when the job
 * is created, so a curated ZIM whose catalog entry has since been corrected
 * (a dead URL replaced, a new build date) is retried with what the catalog
 * says now. The filename changes with the URL because ZIM filenames carry the
 * build date.
 *
 * Anything else keeps its stored params: a download that came from no
 * collection, a non-ZIM download, and a resource the catalog no longer lists
 * (removed or renamed), so a retry is never worse than re-sending the original.
 */
export function refreshRetryParams(
  params: RunDownloadJobParams,
  spec: ZimCategoriesSpec | null
): RunDownloadJobParams {
  const metadata = params.resourceMetadata
  if (!spec || params.filetype !== 'zim' || !metadata?.collection_ref) return params

  const current = spec.categories
    .flatMap((category) => category.tiers)
    .flatMap((tier) => tier.resources)
    .find((resource) => resource.id === metadata.resource_id && resource.type !== 'dataset')
  const filename = current?.url.split('/').pop()
  if (!current || !filename) return params

  return {
    ...params,
    url: current.url,
    filepath: join(dirname(params.filepath), filename),
    totalBytes: current.size_mb > 0 ? current.size_mb * 1024 * 1024 : params.totalBytes,
    resourceMetadata: { ...metadata, version: current.version },
  }
}
