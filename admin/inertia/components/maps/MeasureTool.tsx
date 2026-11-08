import { Layer, Marker, Source } from 'react-map-gl/maplibre'
import { IconArrowBackUp, IconRulerMeasure, IconTrash, IconX } from '@tabler/icons-react'

import {
  formatArea,
  formatDistance,
  pathLengthMeters,
  polygonAreaSqMeters,
  segmentLengthsMeters,
  type LngLat,
  type MeasureUnit,
} from '~/lib/map_measure'

export type Measurement = {
  points: LngLat[]
  /** True once the first point was clicked again: the path became a closed shape with an area. */
  closed: boolean
}

export const EMPTY_MEASUREMENT: Measurement = { points: [], closed: false }

const SOURCE_ID = 'nomad-measure'

type MeasureFeature = {
  type: 'Feature'
  properties: Record<string, never>
  geometry:
    | { type: 'LineString'; coordinates: LngLat[] }
    | { type: 'Polygon'; coordinates: LngLat[][] }
}
type FeatureCollection = { type: 'FeatureCollection'; features: MeasureFeature[] }

/** The accent color from the theme tokens, so the line matches the app in light and Night Ops. */
function accentColor(): string {
  if (typeof window === 'undefined') return '#a84a12'
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-desert-orange')
    .trim()
  return value || '#a84a12'
}

function toGeoJson({ points, closed }: Measurement): FeatureCollection {
  const features: MeasureFeature[] = []
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: closed ? [...points, points[0]] : points },
    })
  }
  if (closed && points.length >= 3) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] },
    })
  }
  return { type: 'FeatureCollection', features }
}

type MeasureLayersProps = {
  measurement: Measurement
  unit: MeasureUnit
  onMovePoint: (index: number, point: LngLat) => void
  /** Clicking the first point (with 3+ points) closes the shape. */
  onClose: () => void
}

/** The measured path drawn on the map: line, filled area, draggable points and segment labels. */
export function MeasureLayers({ measurement, unit, onMovePoint, onClose }: MeasureLayersProps) {
  const { points, closed } = measurement
  const color = accentColor()
  const ring = closed && points.length > 2 ? [...points, points[0]] : points
  const segments = segmentLengthsMeters(ring)

  return (
    <>
      <Source id={SOURCE_ID} type="geojson" data={toGeoJson(measurement)}>
        <Layer
          id={`${SOURCE_ID}-fill`}
          type="fill"
          filter={['==', ['geometry-type'], 'Polygon']}
          paint={{ 'fill-color': color, 'fill-opacity': 0.15 }}
        />
        <Layer
          id={`${SOURCE_ID}-line`}
          type="line"
          filter={['==', ['geometry-type'], 'LineString']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': color, 'line-width': 3, 'line-dasharray': [2, 1.5] }}
        />
      </Source>

      {segments.length > 1 &&
        segments.map((length, i) => {
          const a = ring[i]
          const b = ring[i + 1]
          return (
            <Marker
              key={`segment-${i}`}
              longitude={(a[0] + b[0]) / 2}
              latitude={(a[1] + b[1]) / 2}
              anchor="center"
            >
              <span className="pointer-events-none rounded bg-surface-primary/90 px-1.5 py-0.5 text-[11px] font-medium text-text-primary shadow">
                {formatDistance(length, unit)}
              </span>
            </Marker>
          )
        })}

      {points.map((point, index) => {
        const canClose = index === 0 && !closed && points.length >= 3
        return (
          <Marker
            key={`point-${index}`}
            longitude={point[0]}
            latitude={point[1]}
            anchor="center"
            draggable
            onDrag={(e) => onMovePoint(index, [e.lngLat.lng, e.lngLat.lat])}
            onClick={(e) => {
              // Never let a click on a point reach the map, where it would add another point.
              e.originalEvent.stopPropagation()
              if (canClose) onClose()
            }}
          >
            <div
              title={canClose ? 'Close the shape to measure its area' : 'Drag to move'}
              className={`rounded-full border-2 border-white shadow ${
                canClose ? 'h-4 w-4 cursor-pointer' : 'h-3 w-3 cursor-grab'
              }`}
              style={{ backgroundColor: color }}
            />
          </Marker>
        )
      })}
    </>
  )
}

type MeasurePanelProps = {
  measurement: Measurement
  unit: MeasureUnit
  onUndo: () => void
  onClear: () => void
  onDone: () => void
  onMouseEnter?: () => void
}

const panelButtonClass =
  'flex items-center gap-1 rounded border border-border-default bg-surface-primary px-2 py-1 text-xs text-text-secondary hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50'

/** Totals and controls for the Measure tool, shown while it is on. */
export function MeasurePanel({
  measurement,
  unit,
  onUndo,
  onClear,
  onDone,
  onMouseEnter,
}: MeasurePanelProps) {
  const { points, closed } = measurement
  const distance = pathLengthMeters(points, closed)
  const area = closed ? polygonAreaSqMeters(points) : 0

  return (
    <div
      className="absolute left-1/2 top-[80px] z-40 w-80 -translate-x-1/2 rounded-lg border border-border-subtle bg-surface-primary/95 px-3 py-2.5 shadow-lg backdrop-blur-sm"
      onMouseEnter={onMouseEnter}
    >
      <div className="flex items-center gap-2">
        <IconRulerMeasure size={18} className="text-desert-orange" />
        <span className="text-sm font-medium text-text-primary">Measure</span>
        <button
          type="button"
          onClick={onDone}
          className="ml-auto text-text-muted hover:text-text-primary"
          title="Stop measuring"
        >
          <IconX size={16} />
        </button>
      </div>

      {points.length < 2 ? (
        <p className="mt-1.5 text-xs text-text-secondary">
          Click the map to add points. Click the first point again to measure an area.
        </p>
      ) : (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-text-secondary">{closed ? 'Perimeter:' : 'Distance:'}</dt>
          <dd className="font-medium text-text-primary">{formatDistance(distance, unit)}</dd>
          {closed && (
            <>
              <dt className="text-text-secondary">Area:</dt>
              <dd className="font-medium text-text-primary">{formatArea(area, unit)}</dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={points.length === 0}
          className={panelButtonClass}
          title="Undo last point (Backspace)"
        >
          <IconArrowBackUp size={14} /> Undo
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={points.length === 0}
          className={panelButtonClass}
          title="Clear (Esc)"
        >
          <IconTrash size={14} /> Clear
        </button>
        <span className="ml-auto text-[11px] text-text-muted">Drag points to adjust</span>
      </div>
    </div>
  )
}
