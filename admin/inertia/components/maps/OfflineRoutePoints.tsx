import { useLayoutEffect, useRef, useState } from 'react'
import { IconArrowDown, IconArrowUp, IconGripVertical, IconPlus, IconX } from '@tabler/icons-react'
import MapOmnibox from './MapOmnibox'
import { resolvedRouteInput, unresolvedRouteInput } from '../../../app/utils/map_omnibox'
import useRouteCardMotion from '~/hooks/useRouteCardMotion'
import './route_card_motion.css'
import { parseMapPoint } from '../../../app/utils/map_route_link'
import {
  MAX_ROUTE_POINTS,
  moveRouteStop,
  routePointLabel,
  type RoutePickMode,
  type RouteStop,
} from '../../../app/utils/map_route_points'

type Props = {
  stops: RouteStop[]
  picking: RoutePickMode
  onChange: (value: RouteStop[]) => void
  onPickingChange: (value: RoutePickMode) => void
  onUserAction: () => void
  onCalculate: () => void
  onFocusCoverage: (bounds: [number, number, number, number]) => void
  onChooseMap: () => void
}

const controlClass =
  'rounded p-1 text-text-secondary hover:bg-surface-secondary disabled:opacity-30'

export default function OfflineRoutePoints({
  stops,
  picking,
  onChange,
  onPickingChange,
  onUserAction,
  onCalculate,
  onFocusCoverage,
  onChooseMap,
}: Props) {
  const nextStopId = useRef(0)
  const focusAfterChange = useRef<string | null>(null)
  const [notice, setNotice] = useState('')
  const motion = useRouteCardMotion({
    stops,
    onCommit: (result) => {
      onUserAction()
      onChange(result)
    },
    onNotice: setNotice,
  })
  useLayoutEffect(() => {
    const id = focusAfterChange.current
    if (!id) return
    focusAfterChange.current = null
    const control = document.getElementById(id)
    control?.focus({ preventScroll: true })
    control?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [stops])

  const select = (id: string | null) => {
    onUserAction()
    onPickingChange(id)
  }
  const move = (from: number, to: number) => {
    if (motion.busy) return
    const result = moveRouteStop(stops, from, to)
    if (result === stops) return
    motion.prepareReorder()
    onUserAction()
    onChange(result)
    setNotice(`Point moved to ${routePointLabel(to, stops.length)}. Calculate the route again.`)
  }
  const setValue = (id: string, query: string) => {
    onUserAction()
    onChange(
      stops.map((stop) => (stop.id === id ? { ...stop, ...unresolvedRouteInput(query) } : stop))
    )
  }
  return (
    <div className="space-y-2">
      <ol
        ref={motion.listRef}
        onFocusCapture={motion.onFocusCapture}
        aria-label="Route points"
        className="relative space-y-2"
      >
        {motion.order.map((stop) => {
          const index = stops.findIndex((entry) => entry.id === stop.id)
          const label = routePointLabel(index, stops.length)
          const active = picking === stop.id
          const floating = motion.floatingId === stop.id
          const point = parseMapPoint(stop.value)
          const selected =
            point && stop.label
              ? {
                  ...point,
                  id: `selected:${stop.id}`,
                  label: stop.label,
                  kind: 'selected point',
                  precision: stop.precision || 'coordinates',
                  source: stop.source || 'Selected point',
                  regionId: 'selected',
                }
              : null
          return (
            <li
              key={stop.id}
              ref={(element) => motion.slotRef(stop.id, element)}
              data-route-stop={stop.id}
              aria-label={label}
              style={motion.slotStyle(stop.id)}
              className={
                floating
                  ? 'rounded-md border border-dashed border-desert-orange/50 bg-desert-orange/5'
                  : ''
              }
            >
              <div
                ref={(element) => motion.cardRef(stop.id, element)}
                style={motion.cardStyle(stop.id)}
                className={`rounded-md border bg-surface-primary p-2 transition-colors ${active ? 'border-desert-orange ring-1 ring-desert-orange' : 'border-border-default'} ${floating ? 'route-card-floating' : ''}`}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-route-drag-handle
                    aria-label={`Drag point ${String.fromCharCode(65 + index)} to reorder`}
                    aria-describedby="route-card-reorder-help"
                    title="Drag to reorder, or use the arrow buttons"
                    className={`${controlClass} cursor-grab active:cursor-grabbing`}
                    style={{ touchAction: 'none' }}
                    onPointerDown={(event) => {
                      onUserAction()
                      motion.onPointerDown(stop.id, event)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault()
                        move(index, index + (event.key === 'ArrowUp' ? -1 : 1))
                      }
                    }}
                  >
                    <IconGripVertical size={16} />
                  </button>
                  <button
                    type="button"
                    id={`route-point-${stop.id}`}
                    onClick={() => select(active ? null : stop.id)}
                    aria-pressed={active}
                    className="min-w-0 flex-1 rounded py-1 text-left text-sm font-semibold text-text-primary"
                  >
                    <span key={label} className="route-card-label-enter">
                      {label}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={controlClass}
                    disabled={motion.busy || index === 0}
                    aria-label={`Move point ${String.fromCharCode(65 + index)} up`}
                    onClick={() => move(index, index - 1)}
                  >
                    <IconArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className={controlClass}
                    disabled={motion.busy || index === stops.length - 1}
                    aria-label={`Move point ${String.fromCharCode(65 + index)} down`}
                    onClick={() => move(index, index + 1)}
                  >
                    <IconArrowDown size={15} />
                  </button>
                  {stops.length > 2 && (
                    <button
                      type="button"
                      disabled={motion.busy}
                      className={`${controlClass} hover:text-desert-red`}
                      aria-label={`Remove point ${String.fromCharCode(65 + index)}`}
                      onClick={() => {
                        onUserAction()
                        const remaining = stops.filter((entry) => entry.id !== stop.id)
                        const nextIndex = Math.min(index, remaining.length - 1)
                        const next = remaining[nextIndex]
                        focusAfterChange.current = `route-point-${next.id}`
                        onChange(remaining)
                        if (active) onPickingChange(next.id)
                        setNotice(
                          `Point removed. ${routePointLabel(nextIndex, remaining.length)} is focused.`
                        )
                      }}
                    >
                      <IconX size={15} />
                    </button>
                  )}
                </div>
                <MapOmnibox
                  name={`route-${stop.id}`}
                  label={`${label} location`}
                  value={stop.query ?? stop.value}
                  readOnly={motion.busy}
                  onFocus={() => {
                    select(stop.id)
                  }}
                  onChange={(query) => setValue(stop.id, query)}
                  onConfirm={onCalculate}
                  selected={selected}
                  onSelect={(result) => {
                    onUserAction()
                    onChange(
                      stops.map((entry) =>
                        entry.id === stop.id ? { ...entry, ...resolvedRouteInput(result) } : entry
                      )
                    )
                    select(stop.id)
                    onFocusCoverage(
                      result.bbox ?? [
                        result.lon - 0.008,
                        result.lat - 0.008,
                        result.lon + 0.008,
                        result.lat + 0.008,
                      ]
                    )
                  }}
                />
                {stop.value && stop.label && (
                  <p className="mt-1 break-words text-xs text-text-secondary">
                    {stop.value} · {stop.precision}
                  </p>
                )}
                {!stop.value && stop.query?.trim() && (
                  <p className="mt-1 text-xs text-text-muted">
                    Enter coordinates, click the map or choose a saved pin to set this point.
                  </p>
                )}
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    select(active ? null : stop.id)
                    if (!active) onChooseMap()
                  }}
                  className={`mt-1 rounded px-2 py-1 text-xs font-medium ${active ? 'bg-desert-green text-white' : 'text-desert-green hover:bg-surface-secondary'}`}
                >
                  {active
                    ? 'Cancel map / pin selection'
                    : `Choose point ${String.fromCharCode(65 + index)} on map or Pins`}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        disabled={
          motion.busy ||
          stops.length >= MAX_ROUTE_POINTS ||
          stops.some((stop) => !parseMapPoint(stop.value))
        }
        className="flex w-full items-center justify-center gap-1 rounded border border-border-default px-2 py-1.5 text-xs font-medium text-desert-green hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (stops.length >= MAX_ROUTE_POINTS) return
          onUserAction()
          let id: string
          do {
            id = `route-added-${++nextStopId.current}`
          } while (stops.some((stop) => stop.id === id))
          const stop = { id, value: '' }
          focusAfterChange.current = `route-${id}`
          onChange([...stops, stop])
          onPickingChange(stop.id)
          setNotice(
            'Destination added. The last point is the destination; earlier points are stops.'
          )
        }}
      >
        <IconPlus size={14} />{' '}
        {stops.length >= MAX_ROUTE_POINTS ? 'Maximum: 7 points (A–G)' : 'Add destination'}
      </button>
      <p className="text-xs text-text-secondary">
        Up to 7 points (A–G). The first is the origin; the last is the destination. Drag cards or
        use the arrows to reorder.
      </p>
      <p role="status" className="sr-only">
        {notice}
      </p>
      <p id="route-card-reorder-help" className="sr-only">
        Drag this handle to move the whole card. Release inside the list to confirm, or press Escape
        to cancel. Use the arrow buttons or the up and down arrow keys to reorder with a keyboard.
      </p>
    </div>
  )
}
