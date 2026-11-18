import { useEffect, useRef, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { ELEVATION_CONTOURS_API, type ElevationContoursLookup } from '../../../types/world_offline.js'
import type { MapCamera } from './mapLayerStyles'
import { TOPOGRAPHIC_PALETTE } from './topographicPalette.js'

type ContourResult = ElevationContoursLookup | { status: 'loading' | 'error' }
type ContourData = Extract<ElevationContoursLookup, { status: 'ok' }>
type Bounds = [number, number, number, number]
type CachedView = { scope: string; bounds: Bounds; data: ContourData; positions: number }
const MIN_CAMERA_ZOOM = 8
const VIEW_SETTLE_MS = 60
const LOADING_INDICATOR_MS = 350
const REQUEST_TIMEOUT_MS = 20_000
const MAX_CACHED_VIEWS = 8
const MAX_CACHED_POSITIONS = 120_000
const MAX_LATITUDE = 85.0511287798066
const CREDIT = '<a href="https://mapterhorn.com/attribution">Elevation data © Mapterhorn</a>'

function readContours(value: unknown): ElevationContoursLookup {
  const result = value as ElevationContoursLookup
  if (result?.status === 'no-data' || result?.status === 'not-installed' || result?.status === 'zoom-in') return result
  if (result?.status === 'ok' && result.intervalMeters === 100 && Number.isInteger(result.dataZoom) &&
      result.geojson?.type === 'FeatureCollection' && Array.isArray(result.geojson.features)) return result
  throw new Error('Invalid contour response')
}

function alignView(view: Bounds, reference: Bounds): Bounds {
  const offset = Math.round((reference[0] + reference[2] - view[0] - view[2]) / 720) * 360
  return [view[0] + offset, view[1], view[2] + offset, view[3]]
}

function containsView(bounds: Bounds, view: Bounds) {
  const [west, south, east, north] = alignView(view, bounds)
  return west >= bounds[0] && south >= bounds[1] && east <= bounds[2] && north <= bounds[3]
}

function intersectsView(bounds: Bounds, view: Bounds) {
  const [west, south, east, north] = alignView(view, bounds)
  return west < bounds[2] && east > bounds[0] && south < bounds[3] && north > bounds[1]
}

function roundedBounds([west, south, east, north]: Bounds): Bounds {
  return [
    Math.floor(west * 1e6) / 1e6, Math.floor(south * 1e6) / 1e6,
    Math.ceil(east * 1e6) / 1e6, Math.ceil(north * 1e6) / 1e6,
  ]
}

function bufferedBounds(view: Bounds): Bounds {
  const width = (view[2] - view[0]) * 0.15
  const height = (view[3] - view[1]) * 0.15
  return roundedBounds([
    view[0] - width, Math.max(-MAX_LATITUDE, view[1] - height),
    view[2] + width, Math.min(MAX_LATITUDE, view[3] + height),
  ])
}

function viewQuery([west, south, east, north]: Bounds, zoom: number) {
  return new URLSearchParams({
    west: String(west), south: String(south), east: String(east), north: String(north), zoom: String(zoom),
  }).toString()
}

function countPositions(data: ContourData) {
  let positions = 0
  for (const { geometry } of data.geojson.features) {
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
    for (const line of lines) positions += line.length
  }
  return positions
}

export function useElevationContours(enabled: boolean, camera: MapCamera, inventoryKey?: string, installedZoom = 12) {
  const cache = useRef<CachedView[]>([])
  const [settled, setSettled] = useState<CachedView | null>(null)
  const [entry, setEntry] = useState<{ key: string; result: ContourResult } | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const zoomIn = camera.zoom < MIN_CAMERA_ZOOM
  const dataZoom = Math.min(Math.floor(camera.zoom), installedZoom)
  const scope = inventoryKey && inventoryKey + '|' + dataZoom
  const view = camera.view && roundedBounds(camera.view)
  const queryZoom = Math.max(MIN_CAMERA_ZOOM, dataZoom)
  const query = enabled && scope && !zoomIn && view ? viewQuery(view, queryZoom) : undefined
  const key = query && scope + '|' + query + '|' + retryCount
  const hit = query && view ? cache.current.find((cached) =>
    cached.scope === scope && containsView(cached.bounds, view)) : undefined

  useEffect(() => {
    if (!key || !query || !scope) return
    const currentView = view!
    const cached = cache.current.find((candidate) =>
      candidate.scope === scope && containsView(candidate.bounds, currentView))
    if (cached) {
      cache.current = [cached, ...cache.current.filter((candidate) => candidate !== cached)]
      setSettled(cached)
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
        let bounds = bufferedBounds(currentView)
        const read = async (area: Bounds) => {
          const response = await fetch(ELEVATION_CONTOURS_API + '?' + viewQuery(area, queryZoom),
            { signal: request.signal, cache: 'no-store' })
          if (!response.ok) throw new Error('Contour lookup failed')
          return readContours(await response.json())
        }
        let result = await read(bounds)
        // Keep the margin from forcing a zoom warning in a usable dense viewport.
        if (result.status === 'zoom-in') {
          bounds = currentView
          result = await read(bounds)
        }
        if (cancelled) return
        if (result.status === 'ok') {
          const next = { scope, bounds, data: result, positions: countPositions(result) }
          cache.current = [next, ...cache.current.filter((candidate) =>
            candidate.scope !== scope || candidate.bounds.some((coordinate, index) => coordinate !== bounds[index]))]
          while (cache.current.length > MAX_CACHED_VIEWS ||
              cache.current.reduce((sum, candidate) => sum + candidate.positions, 0) > MAX_CACHED_POSITIONS) {
            cache.current.pop()
          }
          setSettled(next)
        } else {
          setSettled(null)
        }
        setEntry({ key, result })
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
  }, [key, query, scope])

  const active = enabled && inventoryKey && !zoomIn
  const data = !active || !view ? null
    : hit ? hit.data
    : settled && settled.scope === scope && intersectsView(settled.bounds, view) ? settled.data : null
  const result: ContourResult | null = !enabled ? null
    : !inventoryKey ? { status: 'not-installed' }
    : zoomIn ? { status: 'zoom-in' }
    : hit ? hit.data
    : entry && entry.key === key ? entry.result : null
  return { data, result, retry: () => setRetryCount((count) => count + 1) }
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
          'line-color': TOPOGRAPHIC_PALETTE.contour,
          'line-opacity': TOPOGRAPHIC_PALETTE.contourOpacity,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 14, 1.15],
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
          paint={{ 'text-color': TOPOGRAPHIC_PALETTE.contourText, 'text-halo-color': TOPOGRAPHIC_PALETTE.halo, 'text-halo-width': 1.5 }} />
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
        <a href="/settings/maps?pack=elevation#world-offline-elevation"
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
