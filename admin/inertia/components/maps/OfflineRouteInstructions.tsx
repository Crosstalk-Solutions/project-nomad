import { useEffect, useState } from 'react'
import {
  ROUTE_INSTRUCTIONS_PAGE_SIZE,
  routeDistanceLabel,
  routeDurationLabel,
  routeInstructionsText,
  routePointLabel,
  type OfflineRouteResult,
  type RouteLeg,
  type RouteStop,
} from '../../../app/utils/map_route_points'

function LegInstructions({ leg, pointCount }: { leg: RouteLeg; pointCount: number }) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(leg.maneuvers.length / ROUTE_INSTRUCTIONS_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const first = currentPage * ROUTE_INSTRUCTIONS_PAGE_SIZE
  useEffect(() => setPage(0), [leg])
  const heading = `Leg ${leg.fromIndex + 1}: ${String.fromCharCode(65 + leg.fromIndex)} → ${String.fromCharCode(65 + leg.toIndex)}`
  return (
    <section className="rounded border border-border-subtle p-2" aria-label={heading}>
      <h3 className="text-sm font-semibold text-text-primary">{heading}</h3>
      <p className="mt-0.5 text-xs text-text-secondary">
        {routePointLabel(leg.toIndex, pointCount)} · {routeDistanceLabel(leg.distanceMeters)} ·{' '}
        {routeDurationLabel(leg.durationSeconds)}
      </p>
      <ol start={first + 1} className="mt-2 space-y-2 text-sm text-text-primary">
        {leg.maneuvers.slice(first, first + ROUTE_INSTRUCTIONS_PAGE_SIZE).map((step, index) => (
          <li key={first + index} className="flex gap-2 border-t border-border-subtle pt-2">
            <span className="text-xs text-text-muted">{first + index + 1}.</span>
            <div>
              <p>{step.instruction}</p>
              <p className="text-xs text-text-secondary">
                {routeDistanceLabel(step.distanceMeters)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {pageCount > 1 && (
        <nav
          aria-label={`${heading} instruction pages`}
          className="mt-3 flex items-center justify-between gap-2 text-xs"
        >
          <button
            type="button"
            disabled={currentPage === 0}
            className="rounded border border-border-default px-2 py-1 text-desert-green disabled:opacity-40"
            onClick={() => setPage(Math.max(0, currentPage - 1))}
          >
            Previous
          </button>
          <span role="status" className="text-text-secondary">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage === pageCount - 1}
            className="rounded border border-border-default px-2 py-1 text-desert-green disabled:opacity-40"
            onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  )
}

export default function OfflineRouteInstructions({
  route,
  stops,
}: {
  route: OfflineRouteResult
  stops: RouteStop[]
}) {
  const [textUrl, setTextUrl] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([routeInstructionsText(route, stops)], { type: 'text/plain;charset=utf-8' })
    )
    setTextUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [route, stops])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-desert-green">
        {textUrl && (
          <>
            <a href={textUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Open all instructions (text)
            </a>
            <a href={textUrl} download="nomad-offline-route.txt" className="underline">
              Download text
            </a>
          </>
        )}
      </div>
      {route.legs.map((leg) => (
        <LegInstructions key={leg.fromIndex} leg={leg} pointCount={stops.length} />
      ))}
    </div>
  )
}
