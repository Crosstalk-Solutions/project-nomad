import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { MapRegionComponent } from '../../../types/map_regions'
import { getMapRegionEstimate, type MapRegionEstimate } from '~/lib/map_regions_api'
import { formatBytes } from '~/lib/util'

export default function MapRegionDownloadEstimate({
  regionId,
  components,
  operation = 'install',
  onEstimate,
}: {
  regionId: string
  components: MapRegionComponent[]
  operation?: 'install' | 'update'
  onEstimate?: (regionId: string, value?: MapRegionEstimate) => void
}) {
  const selected = [...new Set(components)].sort() as MapRegionComponent[]
  const query = useQuery({
    queryKey: ['map-region-estimate', regionId, selected.join(','), operation],
    queryFn: ({ signal }) => getMapRegionEstimate(regionId, selected, operation, signal),
    enabled: selected.length > 0,
    // The server caches remote metadata; a fresh request also sees local bytes
    // completed or cancelled since the last time this region was selected.
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const value = query.data
  useEffect(() => onEstimate?.(regionId, value), [regionId, value, onEstimate])
  if (!selected.length) return null
  const cached = value?.complete && value.remainingDownloadBytes === 0 && !!value.reusableBytes
  return (
    <div
      className="my-3 rounded border border-border-subtle bg-surface-secondary p-3 text-sm text-text-secondary"
      aria-label="Routing source and preparation size"
      aria-live="polite"
    >
      <p className="font-medium text-text-primary">
        {cached ? 'No download required' : 'Source download'}
      </p>
      {query.isPending ? (
        <p className="mt-1">Checking source availability and size…</p>
      ) : (
        <>
          <p className="mt-1">
            {cached ? 'Local source: ' : 'Source size: '}
            {value?.complete && value.totalSourceBytes !== undefined
              ? formatBytes(value.totalSourceBytes)
              : 'Size unavailable'}
            {!value?.complete && value?.totalSourceBytes
              ? ` · at least ${formatBytes(value.totalSourceBytes)} known`
              : ''}
          </p>
          {!cached && value?.remainingDownloadBytes !== undefined && (
            <p className="mt-1 text-xs">
              Remaining transfer: {formatBytes(value.remainingDownloadBytes)}
            </p>
          )}
          {!cached && !!value?.reusableBytes && (
            <p className="mt-1 text-xs">Reusable local data: {formatBytes(value.reusableBytes)}</p>
          )}
          <p className="mt-2 text-xs text-text-muted">
            {cached
              ? 'The source is already on this NOMAD. Routes still need to be prepared and verified before they are ready offline.'
              : 'Downloading the source is the first step. NOMAD then prepares and verifies the offline routes automatically.'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Source size is not the installed route size. Preparation also needs temporary disk
            space.
          </p>
          {value?.spaceSufficient === false && (
            <p role="alert" className="mt-2 text-xs text-desert-red">
              Not enough available disk space for the current preparation estimate. Free space or
              use another storage volume before starting.
            </p>
          )}
          {value?.diskCheckError && (
            <p role="alert" className="mt-2 text-xs text-desert-red">
              {value.diskCheckError}
            </p>
          )}
          <details className="mt-3 text-xs text-text-muted">
            <summary className="cursor-pointer">Storage and source details</summary>
            {value?.minimumFreeBytes !== undefined && (
              <p className="mt-1 text-xs">
                Preparation free-space requirement (conservative):{' '}
                {formatBytes(value.minimumFreeBytes)}
              </p>
            )}
            {value?.availableFreeBytes !== undefined && (
              <p className="mt-1 text-xs">
                Available disk space: {formatBytes(value.availableFreeBytes)}
              </p>
            )}
            {value?.collection && (
              <p className="mt-1 text-xs">
                Total for {value.packages ?? 'the selected'} published packages. This collection is
                not one connected routing graph.
              </p>
            )}
            {value?.message && <p className="mt-1 text-xs text-text-muted">{value.message}</p>}
            {query.error && (
              <p className="mt-1 text-xs text-text-muted">
                The source size could not be checked. Installed data remains available offline.
              </p>
            )}
            {value?.checkedAt && (
              <p className="mt-1 text-xs text-text-muted">
                Source metadata checked: {new Date(value.checkedAt).toLocaleString()}
              </p>
            )}
          </details>
          <button
            type="button"
            className="mt-2 text-xs text-desert-green underline disabled:opacity-50"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? 'Checking…' : 'Refresh size'}
          </button>
        </>
      )}
    </div>
  )
}
