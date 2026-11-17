import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { ELEVATION_CONTOURS_API, type ElevationContoursLookup } from '../../../types/world_offline.js'
import { ELEVATION_SETTINGS_LINK } from './ElevationInspection'
import type { MapCamera } from './mapLayerStyles'

type ContourResult = ElevationContoursLookup | { status: 'loading' | 'error' }
type ContourData = Extract<ElevationContoursLookup, { status: 'ok' }>
const MIN_CAMERA_ZOOM = 8
const VIEW_SETTLE_MS = 220
const LOADING_INDICATOR_MS = 350
const REQUEST_TIMEOUT_MS = 20_000
const CREDIT = '<a href="https://mapterhorn.com/attribution">Elevation data © Mapterhorn</a>'

function readContours(value: unknown): ElevationContoursLookup {
  const result = value as ElevationContoursLookup
  if (result?.status === 'no-data' || result?.status === 'not-installed' || result?.status === 'zoom-in') return result
  if (result?.status === 'ok' && result.intervalMeters === 100 && Number.isInteger(result.dataZoom) &&
      result.geojson?.type === 'FeatureCollection' && Array.isArray(result.geojson.features)) return result
  throw new Error('Invalid contour response')
}

function viewQuery(camera: MapCamera) {
  if (!camera.view) return undefined
  const [west, south, east, north] = camera.view
  return new URLSearchParams({
    west: west.toFixed(5), south: south.toFixed(5), east: east.toFixed(5), north: north.toFixed(5),
    zoom: camera.zoom.toFixed(4),
  }).toString()
}

export function useElevationContours(enabled: boolean, camera: MapCamera, inventoryKey?: string) {
  const [entry, setEntry] = useState<{ key: string; result: ContourResult } | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const zoomIn = camera.zoom < MIN_CAMERA_ZOOM
  const query = enabled && inventoryKey && !zoomIn ? viewQuery(camera) : undefined
  const key = query && inventoryKey + '|' + query + '|' + retryCount

  useEffect(() => {
    if (!key || !query) {
      setEntry(null)
      return
    }
    let cancelled = false
    const request = new AbortController()
    const delay = window.setTimeout(async () => {
      const loadingTimer = window.setTimeout(() => {
        if (!cancelled) setEntry({ key, result: { status: 'loading' } })
      }, LOADING_INDICATOR_MS)
      const timeout = window.setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(ELEVATION_CONTOURS_API + '?' + query, { signal: request.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Contour lookup failed')
        const result = readContours(await response.json())
        if (!cancelled) setEntry({ key, result })
      } catch {
        if (!cancelled) setEntry({ key, result: { status: 'error' } })
      } finally {
        window.clearTimeout(timeout)
        window.clearTimeout(loadingTimer)
      }
    }, VIEW_SETTLE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(delay)
      request.abort()
    }
  }, [key, query])

  const result: ContourResult | null = !enabled ? null
    : !inventoryKey ? { status: 'not-installed' }
    : zoomIn ? { status: 'zoom-in' }
    : entry && entry.key === key ? entry.result : null
  return { result, retry: () => setRetryCount((count) => count + 1) }
}

export function ElevationContourLayer({ data, glyphsAvailable }: {
  data: ContourData
  glyphsAvailable: boolean
}) {
  return (
    <Source id="nomad-elevation-contours" type="geojson" data={data.geojson} attribution={CREDIT}>
      <Layer id="nomad-elevation-contour-lines" type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': '#6c421f',
          'line-opacity': 0.73,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.85, 14, 1.35],
        }} />
      {glyphsAvailable && (
        <Layer id="nomad-elevation-contour-labels" type="symbol"
          layout={{
            'symbol-placement': 'line',
            'symbol-spacing': 175,
            'text-field': ['concat', ['to-string', ['get', 'elevationMeters']], ' m'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-padding': 5,
            'text-max-angle': 30,
            'text-keep-upright': true,
            'text-allow-overlap': false,
          }}
          paint={{ 'text-color': '#4b301a', 'text-halo-color': '#fffdf7', 'text-halo-width': 1.5 }} />
      )}
    </Source>
  )
}

export function ContourStatus({ result, onRetry }: { result: ContourResult | null; onRetry: () => void }) {
  if (!result || (result.status === 'ok' && result.geojson.features.length)) return null
  const labels = {
    'not-installed': 'Elevation data is not installed.',
    'no-data': 'No elevation data in this view.',
    'zoom-in': 'Zoom in to show contour lines.',
    'loading': 'Drawing contour lines…',
    'error': 'Could not load contour lines.',
    'ok': 'No 100 m contours in this view.',
  }
  return (
    <div className="absolute right-3 top-[76px] z-[3] max-w-[calc(100%-8rem)] rounded-md border border-border-subtle bg-surface-primary px-2.5 py-1.5 text-xs text-text-primary shadow">
      <p role={result.status === 'loading' ? undefined : 'status'}>{labels[result.status]}</p>
      {result.status === 'not-installed' && (
        <a href={ELEVATION_SETTINGS_LINK}
          className="inline-flex min-h-8 items-center rounded font-semibold text-desert-orange underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
          Download elevation data
        </a>
      )}
      {result.status === 'error' && (
        <button type="button" onClick={onRetry} aria-label="Retry contour lines"
          className="min-h-8 rounded font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
          Retry
        </button>
      )}
    </div>
  )
}
