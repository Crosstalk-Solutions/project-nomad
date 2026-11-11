import { IconAlertTriangle, IconClock, IconDownload, IconSettings } from '@tabler/icons-react'
import type { MapRegionComponentState, MapRegionState } from '../../../types/map_regions'
import { regionOperationBusy } from '~/lib/map_region_downloads'
import { operationWorkLabel } from '~/lib/map_region_operation_ui'

function ownStates(region: MapRegionState) {
  return Object.values(region.components).filter(
    (state): state is MapRegionComponentState =>
      !!state &&
      (regionOperationBusy(state.status) || state.status === 'failed') &&
      (!(state.pendingProvider || state.availability === 'inherited') || !!state.operation?.id)
  )
}

export default function MapRegionTreeActivity({
  regions,
  ownerId,
  onReveal,
}: {
  regions: MapRegionState[]
  ownerId: string
  onReveal: () => void
}) {
  if (!regions.length) return null
  const states = regions.flatMap(ownStates)
  const attention = regions.filter((region) =>
    ownStates(region).some(
      (state) => state.status === 'failed' || state.operation?.activity === 'unavailable'
    )
  ).length
  const active = regions.filter((region) =>
    ownStates(region).some((state) => regionOperationBusy(state.status))
  ).length
  const ordered = [...states].sort((a, b) => {
    const score = (state: MapRegionComponentState) =>
      state.operation?.activity === 'unavailable'
        ? 0
        : state.status === 'failed'
          ? 1
          : state.status === 'cancelling'
            ? 2
            : state.status === 'downloading'
              ? 3
              : state.status === 'preparing'
                ? 4
                : state.status === 'queued'
                  ? 5
                  : 6
    return score(a) - score(b)
  })
  const state = ordered[0]
  if (!state) return null
  const aggregate = regions.length !== 1 || regions[0].id !== ownerId
  const Icon = attention
    ? IconAlertTriangle
    : state.status === 'queued'
      ? IconClock
      : state.status === 'downloading'
        ? IconDownload
        : IconSettings
  const operation = state.operation
  const downloading = operation?.phase === 'downloading' && operation.sourceMode !== 'cached'
  const bytes = downloading
    ? (operation.bytesTransferred ?? state.bytesDownloaded)
    : operation?.stageBytesProcessed
  const total = downloading
    ? (operation?.totalBytes ?? state.totalBytes)
    : operation?.stageTotalBytes
  const measured =
    !aggregate &&
    operation?.activity !== 'unavailable' &&
    !['failed', 'cancelled', 'queued', 'cancelling'].includes(state.status)
  const percent =
    measured && bytes !== undefined && total && total > 0
      ? Math.min(100, Math.max(0, (100 * bytes) / total))
      : undefined
  const label = aggregate
    ? [
        active ? `${active} active region${active === 1 ? '' : 's'}` : '',
        attention ? `${attention} need${attention === 1 ? 's' : ''} attention` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : operation?.activity === 'unavailable'
      ? 'Status unavailable'
      : operationWorkLabel(operation?.phase || state.status, operation?.detail)
  return (
    <div className="mt-1 min-w-0">
      <p
        className={`flex flex-wrap items-center gap-1.5 text-xs ${attention ? 'text-desert-orange' : 'text-text-secondary'}`}
      >
        <Icon size={14} className="shrink-0" aria-hidden="true" />
        <span>
          {label}
          {percent !== undefined
            ? ` · ${Math.floor(percent)}% of this ${operation?.detail ? 'substep' : 'step'}`
            : ''}
        </span>
        {aggregate && (
          <button
            type="button"
            onClick={onReveal}
            className="rounded underline focus-visible:ring-2 focus-visible:ring-desert-green"
          >
            Show active regions
          </button>
        )}
      </p>
      {!!active &&
        !['queued', 'cancelling'].includes(state.status) &&
        operation?.activity !== 'unavailable' && (
          <progress
            max={100}
            {...(percent !== undefined ? { value: percent } : {})}
            className="mt-1 block h-1 w-full max-w-sm accent-desert-green"
            aria-label={`${aggregate ? 'Region activity' : regions[0].name}: ${label}`}
          />
        )}
    </div>
  )
}
