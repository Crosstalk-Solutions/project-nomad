import { useCallback, useEffect, useState } from 'react'
import { Head, Link, router } from '@inertiajs/react'

import MapsLayout from '~/layouts/MapsLayout'
import MapComponent from '~/components/maps/MapComponent'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft, IconCrosshair, IconMapPin, IconPlaneTilt, IconX } from '@tabler/icons-react'
import { FileEntry } from '../../types/files'
import Alert from '~/components/Alert'
import MapOmnibox from '~/components/maps/MapOmnibox'
import MapSearchControls from '~/components/maps/MapSearchControls'
import useMapSearchEnvironment from '~/hooks/useMapSearchEnvironment'
import {
  coordinateOmniboxPlace,
  resolvedRouteInput,
  type OmniboxPlace,
} from '../../app/utils/map_omnibox'
import { formatMapPoint, parseMapRouteLink } from '../../app/utils/map_route_link'
import OfflineRoutePanel, { parseRoutePoint } from '~/components/maps/OfflineRoutePanel'
import type {
  OfflineRouteResult,
  RoutePickMode,
  RoutePoint,
  RouteStop,
} from '~/components/maps/OfflineRoutePanel'
import {
  createRouteStops,
  parsedRouteStops,
  routePointLabel,
} from '../../app/utils/map_route_points'

type MapCommand = {
  id: number
  lat: number
  lng: number
  action: 'fly' | 'marker'
}

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; worldBasemapExists: boolean; regionFiles: FileEntry[] }
}) {
  const [isHoveringUI, setIsHoveringUI] = useState(false)

  const [coordinateSearch, setCoordinateSearch] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<OmniboxPlace | null>(null)
  const [showPlacePreview, setShowPlacePreview] = useState(false)
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null)
  const [showCoordinatesEnabled, setShowCoordinatesEnabled] = useState(true)
  const [routeLink] = useState(() => parseMapRouteLink(window.location.search))
  const [routeStops, setRouteStops] = useState<RouteStop[]>(() =>
    createRouteStops(routeLink.origin, routeLink.destination, routeLink.vias)
  )
  const searchEnvironment = useMapSearchEnvironment()
  const [route, setRoute] = useState<OfflineRouteResult | null>(null)
  const [routePanelOpen, setRoutePanelOpen] = useState(() => window.innerWidth >= 768)
  const [pickingRoutePoint, setPickingRoutePoint] = useState<RoutePickMode>(null)
  const [boundsCommand, setBoundsCommand] = useState<{
    id: number
    bounds: [number, number, number, number]
  } | null>(null)

  useEffect(() => {
    if (routeLink.error) return
    const points = parsedRouteStops(
      createRouteStops(routeLink.origin, routeLink.destination, routeLink.vias)
    ).filter((point): point is RoutePoint => point !== null)
    if (!points.length) return
    setBoundsCommand({
      id: Date.now(),
      bounds: [
        Math.max(-180, Math.min(...points.map((p) => p.lon)) - 0.005),
        Math.max(-90, Math.min(...points.map((p) => p.lat)) - 0.005),
        Math.min(180, Math.max(...points.map((p) => p.lon)) + 0.005),
        Math.min(90, Math.max(...points.map((p) => p.lat)) + 0.005),
      ],
    })
  }, [routeLink])

  const handleStopsChange = useCallback((stops: RouteStop[]) => {
    setRouteStops(stops)
    setRoute(null)
  }, [])

  const handleRoutePoint = useCallback(
    (point: RoutePoint & { label?: string; precision?: string; source?: string }) => {
      if (!pickingRoutePoint) return
      setRouteStops((current) =>
        current.map((stop) =>
          stop.id === pickingRoutePoint
            ? {
                ...stop,
                value: formatMapPoint(point),
                query: point.label || formatMapPoint(point),
                label: point.label,
                precision: point.precision || 'coordinates',
                source: point.source || 'Map point',
              }
            : stop
        )
      )
      setRoute(null)
    },
    [pickingRoutePoint]
  )

  useEffect(() => {
    if (!pickingRoutePoint) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickingRoutePoint(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pickingRoutePoint])

  const handleCoordinateAction = (action: 'fly' | 'marker') => {
    const place = selectedPlace || coordinateOmniboxPlace(coordinateSearch)
    if (!place) return

    setMapCommand({
      id: Date.now(),
      lat: place.lat,
      lng: place.lon,
      action,
    })
  }
  const choosePlace = (place: OmniboxPlace) => {
    setSelectedPlace(place)
    setCoordinateSearch(place.label)
    setShowPlacePreview(true)
    if (pickingRoutePoint) {
      setRouteStops((current) =>
        current.map((stop) =>
          stop.id === pickingRoutePoint ? { ...stop, ...resolvedRouteInput(place) } : stop
        )
      )
      setRoute(null)
    }
    setMapCommand({ id: Date.now(), lat: place.lat, lng: place.lon, action: 'fly' })
  }
  const useSelectedForRoute = (index: number) => {
    if (!selectedPlace) return
    setRouteStops((current) =>
      current.map((stop, position) =>
        position === index ? { ...stop, ...resolvedRouteInput(selectedPlace) } : stop
      )
    )
    setRoute(null)
    setPickingRoutePoint(routeStops[index].id)
    setShowPlacePreview(false)
  }

  const alertMessage = !props.maps.baseAssetsExist
    ? 'The base map assets have not been installed. Please download them first to enable map functionality.'
    : !props.maps.worldBasemapExists
      ? 'The world base map has not been downloaded yet, so the map may appear blank outside downloaded regions. Connect this NOMAD to the internet and download it (~15 MB) from Map Settings.'
      : props.maps.regionFiles.length === 0
        ? 'No map regions have been downloaded yet. Please download some regions to enable map functionality.'
        : null

  return (
    <MapsLayout>
      <Head title="Maps" />

      <div className="relative h-full w-full overflow-clip">
        {/* Navbar */}
        <div
          className="absolute top-0 left-0 right-0 z-50 flex h-24 items-start justify-between gap-2 bg-surface-secondary px-3 py-2 shadow-sm backdrop-blur-sm sm:px-4 md:h-16 md:items-center md:py-0"
          onMouseEnter={() => setIsHoveringUI(true)}
          onMouseLeave={() => setIsHoveringUI(false)}
        >
          <Link
            href="/home"
            className="mt-1 flex shrink-0 items-center self-start text-text-secondary md:mt-0 md:self-auto"
            aria-label="Back to Home"
          >
            <IconArrowLeft className="md:mr-2" size={24} />
            <p className="hidden text-lg md:block">Back to Home</p>
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 sm:gap-2 md:flex-nowrap">
            <div className="w-full min-w-0 basis-full md:w-auto md:max-w-md md:basis-auto md:flex-1">
              <MapOmnibox
                name="map-coordinate-search"
                label="Coordinates"
                value={coordinateSearch}
                compact
                selected={selectedPlace}
                onChange={(value) => {
                  setCoordinateSearch(value)
                  setSelectedPlace(null)
                  setShowPlacePreview(false)
                }}
                onSelect={choosePlace}
                onConfirm={() => handleCoordinateAction('fly')}
              />
            </div>
            <MapSearchControls
              environment={searchEnvironment}
              selection={selectedPlace}
              onSelect={choosePlace}
            />

            <button
              type="button"
              onClick={() => handleCoordinateAction('fly')}
              disabled={!selectedPlace && !coordinateOmniboxPlace(coordinateSearch)}
              className="hidden shrink-0 rounded border border-border-default bg-surface-primary p-1.5 text-text-secondary hover:bg-surface-secondary sm:block"
              aria-label="Fly to coordinates"
            >
              <IconPlaneTilt size={18} />
            </button>

            <button
              type="button"
              onClick={() => handleCoordinateAction('marker')}
              disabled={!selectedPlace && !coordinateOmniboxPlace(coordinateSearch)}
              className="hidden shrink-0 rounded border border-border-default bg-surface-primary p-1.5 text-text-secondary hover:bg-surface-secondary sm:block"
              aria-label="Add marker at coordinates"
            >
              <IconMapPin size={18} />
            </button>

            <button
              type="button"
              onClick={() => setShowCoordinatesEnabled((prev) => !prev)}
              className={`shrink-0 rounded border border-border-default p-1.5 transition-colors ${
                showCoordinatesEnabled
                  ? 'bg-desert-green text-white'
                  : 'bg-surface-primary text-text-secondary hover:bg-surface-secondary'
              }`}
              aria-label={showCoordinatesEnabled ? 'Hide coordinates' : 'Show coordinates'}
              aria-pressed={showCoordinatesEnabled}
            >
              <IconCrosshair size={18} />
            </button>

            <Link href="/settings/maps" className="shrink-0" aria-label="Manage Map Regions">
              <StyledButton variant="primary" icon="IconSettings" size="sm">
                <span className="hidden md:inline">Manage Map Regions</span>
                <span className="sr-only md:hidden">Map Settings</span>
              </StyledButton>
            </Link>
          </div>
        </div>

        {showPlacePreview && selectedPlace && !pickingRoutePoint && (
          <section
            aria-label="Selected map point"
            className="absolute left-4 top-[152px] z-40 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border-default bg-surface-primary p-3 shadow-lg md:top-[120px]"
            onMouseEnter={() => setIsHoveringUI(true)}
            onMouseLeave={() => setIsHoveringUI(false)}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">{selectedPlace.label}</h2>
              <button
                type="button"
                aria-label="Close selected point"
                onClick={() => setShowPlacePreview(false)}
                className="text-text-muted"
              >
                <IconX size={16} />
              </button>
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {[selectedPlace.kind, selectedPlace.precision, selectedPlace.source]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="mt-1 text-xs text-text-muted">{formatMapPoint(selectedPlace)}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-desert-green">
              <button type="button" className="underline" onClick={() => useSelectedForRoute(0)}>
                Use as origin
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => useSelectedForRoute(routeStops.length - 1)}
              >
                Use as destination
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => handleCoordinateAction('marker')}
              >
                Save pin
              </button>
              <button
                type="button"
                className="underline"
                onClick={() =>
                  searchEnvironment.setBase({
                    lat: selectedPlace.lat,
                    lon: selectedPlace.lon,
                    label: selectedPlace.label,
                  })
                }
              >
                Set as Base
              </button>
            </div>
          </section>
        )}

        {/* Alert */}
        {alertMessage && (
          <div
            className="absolute bottom-24 left-4 right-4 z-40 md:right-[25rem]"
            onMouseEnter={() => setIsHoveringUI(true)}
            onMouseLeave={() => setIsHoveringUI(false)}
          >
            <Alert
              title={alertMessage}
              type="warning"
              variant="solid"
              className="w-full"
              buttonProps={{
                variant: 'secondary',
                children: 'Go to Map Settings',
                icon: 'IconSettings',
                onClick: () => router.visit('/settings/maps'),
              }}
            />
          </div>
        )}

        <div
          className="absolute right-4 top-[104px] z-40 md:top-[72px]"
          onMouseEnter={() => setIsHoveringUI(true)}
          onMouseLeave={() => setIsHoveringUI(false)}
        >
          <OfflineRoutePanel
            stops={routeStops}
            onStopsChange={handleStopsChange}
            picking={pickingRoutePoint}
            onPickingChange={setPickingRoutePoint}
            route={route}
            onRouteChange={setRoute}
            onFocusCoverage={(bounds) => setBoundsCommand({ id: Date.now(), bounds })}
            onOpenChange={setRoutePanelOpen}
            initialLink={routeLink}
          />
        </div>

        {/* Map */}

        <div className="absolute inset-0">
          <MapComponent
            mapCommand={mapCommand}
            isHoveringUI={isHoveringUI}
            showCoordinatesEnabled={showCoordinatesEnabled}
            route={route}
            routePoints={routeStops.map((stop, index) => ({
              id: stop.id,
              point: parseRoutePoint(stop.value),
              label: routePointLabel(index, routeStops.length),
              placeLabel: stop.label,
              placePrecision: stop.precision,
              placeSource: stop.source,
            }))}
            pickingRoutePoint={pickingRoutePoint !== null}
            pickingRouteLabel={
              pickingRoutePoint
                ? routePointLabel(
                    routeStops.findIndex((stop) => stop.id === pickingRoutePoint),
                    routeStops.length
                  )
                : undefined
            }
            onRoutePoint={handleRoutePoint}
            onViewChange={searchEnvironment.onViewChange}
            boundsCommand={boundsCommand}
            routePanelOpen={routePanelOpen}
          />
        </div>
      </div>
    </MapsLayout>
  )
}
