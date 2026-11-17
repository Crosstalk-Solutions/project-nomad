import { IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Popup } from 'react-map-gl/maplibre'
import { ELEVATION_API, type ElevationLookup } from '../../../types/world_offline.js'

export type MapPoint = { lat: number; lng: number }
type Result = ElevationLookup | { status: 'loading' | 'error' }
type Inspection = { point: MapPoint; result: Result }

export const ELEVATION_SETTINGS_LINK = '/settings/maps?pack=elevation#world-offline-elevation'
const LOOKUP_TIMEOUT_MS = 8_000
const METERS = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })

function readElevation(value: unknown): ElevationLookup {
  const result = value as ElevationLookup
  if (result?.status === 'no-data' || result?.status === 'not-installed') return result
  if (result?.status === 'ok' && Number.isFinite(result.elevationMeters) && Number.isInteger(result.zoom)) return result
  throw new Error('Invalid elevation response')
}

export function useElevationInspection() {
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const activeRequest = useRef<AbortController | null>(null)

  const abortLookup = useCallback(() => {
    const previous = activeRequest.current
    activeRequest.current = null
    previous?.abort()
  }, [])

  const dismiss = useCallback(() => {
    abortLookup()
    setInspection(null)
  }, [abortLookup])

  useEffect(() => abortLookup, [abortLookup])

  const lookup = useCallback(async (point: MapPoint) => {
    abortLookup()
    const controller = new AbortController()
    activeRequest.current = controller
    setInspection({ point, result: { status: 'loading' } })

    const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) })
    const timeout = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
    try {
      const response = await fetch(ELEVATION_API + '?' + params, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Elevation lookup failed')
      const result = readElevation(await response.json())
      if (activeRequest.current === controller) setInspection({ point, result })
    } catch {
      if (activeRequest.current === controller) setInspection({ point, result: { status: 'error' } })
    } finally {
      window.clearTimeout(timeout)
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }, [abortLookup])

  return { inspection, lookup, dismiss }
}

export default function ElevationInspection({ inspection, onClose, onRetry }: {
  inspection: Inspection
  onClose: () => void
  onRetry: () => void
}) {
  const { point, result } = inspection
  return (
    <Popup className="nomad-elevation-popup" longitude={point.lng} latitude={point.lat} closeOnClick={false} closeButton={false}
      focusAfterOpen={false} onClose={onClose} maxWidth="min(240px, calc(100vw - 24px))">
      <section aria-label="Elevation at selected point" className="w-44 max-w-full text-text-primary"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Elevation</h2>
          <button type="button" onClick={onClose} aria-label="Close elevation result"
            className="grid size-8 shrink-0 place-items-center rounded text-text-secondary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-primary">
            <IconX aria-hidden="true" size={16} />
          </button>
        </div>
        <div aria-live="polite" aria-atomic="true" className="text-sm">
          {result.status === 'loading' && <p className="text-text-secondary">Looking up elevation…</p>}
          {result.status === 'ok' && (
            <>
              <p className="text-lg font-semibold tabular-nums">
                <span className="sr-only">Approximately </span>
                <span aria-hidden="true">≈ </span>
                {METERS.format(Math.round(result.elevationMeters) || 0)} m
              </p>
              <p className="text-xs text-text-secondary">Data zoom {result.zoom}</p>
            </>
          )}
          {result.status === 'no-data' && <p>No elevation data for this point.</p>}
          {result.status === 'not-installed' && <p>Elevation data is not installed.</p>}
          {result.status === 'error' && <p>Could not look up elevation.</p>}
        </div>
        {result.status === 'ok' && (
          <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-block rounded text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-primary">
            Elevation data © Mapterhorn
          </a>
        )}
        {result.status === 'not-installed' && (
          <a href={ELEVATION_SETTINGS_LINK}
            className="mt-1 inline-flex min-h-8 items-center rounded text-sm font-medium text-desert-orange underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
            Download elevation data
          </a>
        )}
        {result.status === 'error' && (
          <button type="button" onClick={onRetry}
            className="mt-1 inline-flex min-h-8 items-center rounded text-sm font-medium text-desert-orange underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
            Retry
          </button>
        )}
      </section>
    </Popup>
  )
}
