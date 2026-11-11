import { IconHome } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'
import type { MapSearchEnvironment } from '~/hooks/useMapSearchEnvironment'
import { coordinateOmniboxPlace, type OmniboxPlace } from '../../../app/utils/map_omnibox'
import { formatMapPoint } from '../../../app/utils/map_route_link'

export default function MapSearchControls({
  environment,
  selection,
  onSelect,
}: {
  environment: MapSearchEnvironment
  selection?: OmniboxPlace | null
  onSelect: (place: OmniboxPlace) => void
}) {
  const details = useRef<HTMLDetailsElement | null>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (details.current?.open && !details.current.contains(event.target as Node))
        details.current.open = false
    }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [])
  return (
    <div className="flex shrink-0 items-center gap-1">
      <details
        ref={details}
        className="relative text-sm"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && details.current?.open) {
            event.preventDefault()
            event.stopPropagation()
            details.current.open = false
            details.current.querySelector('summary')?.focus({ preventScroll: true })
          }
        }}
      >
        <summary
          className="flex cursor-pointer list-none items-center gap-1 rounded border border-border-default bg-surface-primary p-1.5 text-text-secondary"
          aria-label="Optional saved Base"
        >
          <IconHome size={18} />
        </summary>
        <div className="absolute right-0 top-full z-[80] mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-md border border-border-default bg-surface-primary p-3 text-text-primary shadow-lg">
          <div>
            <p className="text-xs font-semibold">Optional Base</p>
            {environment.base ? (
              <>
                <p className="mt-1 break-words text-xs">{environment.base.label}</p>
                <p className="text-xs text-text-muted">{formatMapPoint(environment.base)}</p>
                <button
                  type="button"
                  className="mt-2 block text-xs text-desert-green underline"
                  onClick={() => {
                    const place = coordinateOmniboxPlace(formatMapPoint(environment.base!))!
                    onSelect({
                      ...place,
                      label: environment.base!.label,
                      precision: 'saved point',
                      source: 'Base in this browser',
                    })
                    if (details.current) details.current.open = false
                  }}
                >
                  Use Base coordinates
                </button>
                <button
                  type="button"
                  className="mt-2 block text-xs text-desert-green underline"
                  onClick={() => environment.setBase(null)}
                >
                  Clear Base
                </button>
              </>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Save a coordinate point as your home, base or another reference.
              </p>
            )}
            {selection && (
              <button
                type="button"
                className="mt-2 block text-xs text-desert-green underline"
                onClick={() =>
                  environment.setBase({
                    lat: selection.lat,
                    lon: selection.lon,
                    label: selection.label,
                  })
                }
              >
                Save selected point as Base
              </button>
            )}
            <button
              type="button"
              disabled={!environment.view}
              className="mt-2 block text-xs text-desert-green underline disabled:opacity-40"
              onClick={() => {
                if (environment.view)
                  environment.setBase({ ...environment.view, label: 'Base at map center' })
              }}
            >
              Save map center as Base
            </button>
            <p className="mt-2 text-xs text-text-muted">
              Saved only in this browser. Base recalls a coordinate point without a network
              connection.
            </p>
            {environment.persistenceError && (
              <p role="status" className="mt-1 text-xs text-desert-red">
                {environment.persistenceError}
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  )
}
