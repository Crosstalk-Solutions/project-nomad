import Map, {
  FullscreenControl,
  Marker,
  MapProvider,
  NavigationControl,
  ScaleControl,
  Source,
  Layer,
} from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { Protocol } from 'pmtiles'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useMapMarkers } from '~/hooks/useMapMarkers'

import MarkerPin from './MarkerPin'
import MarkerPanel from './MarkerPanel'
import CoordinateOverlay from './CoordinateOverlay'
import ViewMapMarkerPopup from './ViewMapMarkerPopup'
import MapMarkerFormPopup from './MapMarkerFormPopup'
import ScaleUnitToggle from './ScaleUnitSelector'
import type { OfflineRouteResult, RoutePoint } from './OfflineRoutePanel'
import { formatMapPoint, mapPointerMoved } from '../../../app/utils/map_route_link'
import {
  mapFramingBounds,
  normalizeMapEventPoint,
  normalizedMapBounds,
  type SearchMapView,
} from '../../../app/utils/map_omnibox'

type ScaleUnit = 'imperial' | 'metric' | 'nautical'

type MapCommand = {
  id: number
  lat: number
  lng: number
  action: 'fly' | 'marker'
}

type MapComponentProps = {
  mapCommand?: MapCommand | null
  isHoveringUI?: boolean
  showCoordinatesEnabled?: boolean
  route?: OfflineRouteResult | null
  routePoints?: {
    id: string
    point: RoutePoint | null
    label: string
    placeLabel?: string
    placePrecision?: string
    placeSource?: string
  }[]
  pickingRoutePoint?: boolean
  pickingRouteLabel?: string
  onRoutePoint?: (
    point: RoutePoint & { label?: string; precision?: string; source?: string }
  ) => void
  onViewChange?: (point: SearchMapView) => void
  boundsCommand?: { id: number; bounds: [number, number, number, number] } | null
  routePanelOpen?: boolean
}

type MapLocationParams = {
  lat: number
  lng: number
  zoom: number
}

const SAVED_MAP_VIEW_KEY = 'nomad:map-view'
const DEFAULT_MAP_VIEW = { longitude: -101, latitude: 40, zoom: 3.5 }

const getRouteColors = () => {
  const tokens = getComputedStyle(document.documentElement)
  return {
    line: tokens.getPropertyValue('--color-desert-orange').trim(),
    halo: tokens.getPropertyValue('--color-surface-primary').trim(),
  }
}

type SavedMapView = { longitude: number; latitude: number; zoom: number }

const getMapLocationParams = (): MapLocationParams | null => {
  const params = new URLSearchParams(window.location.search)

  const latParam = params.get('lat')
  const lngParam = params.get('lng')
  const longParam = params.get('long')
  const rawLng = lngParam ?? longParam

  // Both coordinates must actually be present. Coercing a missing param instead
  // yields Number(null) === 0, which passes every bounds check below and flies
  // the map to 0,0 on a plain visit to /maps -- overriding the restored view and
  // then persisting Null Island back over it via onMoveEnd.
  if (!latParam || !rawLng) return null

  const lat = Number(latParam)
  const lng = Number(rawLng)
  const zoomParam = params.get('zoom')
  const zoom = zoomParam ? Number(zoomParam) : 12

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }

  if (!lngParam && longParam) {
    params.set('lng', longParam)
    params.delete('long')

    const query = params.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    )
  }

  return {
    lat,
    lng,
    zoom: Number.isFinite(zoom) ? zoom : 12,
  }
}

// Restore the last map position/zoom from localStorage so a refresh of /maps doesn't snap back
// to the default US-wide view. Bounds-checked so a corrupt or out-of-range value falls through
// to the default instead of throwing.
const getSavedMapView = (): SavedMapView | null => {
  try {
    const raw = localStorage.getItem(SAVED_MAP_VIEW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isFinite(parsed.longitude) &&
      Number.isFinite(parsed.latitude) &&
      Number.isFinite(parsed.zoom) &&
      parsed.latitude >= -90 &&
      parsed.latitude <= 90 &&
      parsed.longitude >= -180 &&
      parsed.longitude <= 180
    ) {
      return { longitude: parsed.longitude, latitude: parsed.latitude, zoom: parsed.zoom }
    }
  } catch {
    // ignore — fall through to default
  }
  return null
}

const isValidMarkerCoordinate = (marker: { longitude: number; latitude: number }) =>
  Number.isFinite(marker.longitude) &&
  Number.isFinite(marker.latitude) &&
  marker.longitude >= -180 &&
  marker.longitude <= 180 &&
  marker.latitude >= -90 &&
  marker.latitude <= 90
export default function MapComponent({
  mapCommand,
  isHoveringUI = false,
  showCoordinatesEnabled = true,
  route = null,
  routePoints,
  pickingRoutePoint = false,
  pickingRouteLabel,
  onRoutePoint,
  boundsCommand,
  routePanelOpen = false,
  onViewChange,
}: MapComponentProps) {
  const mapRef = useRef<MapRef>(null)
  const animationFrameRef = useRef<number | null>(null)
  const handledMapCommandIdRef = useRef<number | null>(null)
  const rightGesture = useRef<{
    x: number
    y: number
    moved: boolean
    copied: boolean
    released: boolean
    pending?: RoutePoint
  } | null>(null)
  const [clipboardNotice, setClipboardNotice] = useState<{ value: string; copied: boolean } | null>(
    null
  )

  const { markers, addMarker, updateMarker, deleteMarker } = useMapMarkers()

  const [targetIndicator, setTargetIndicator] = useState<{ lng: number; lat: number } | null>(null)
  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [placingMarker, setPlacingMarker] = useState<{ lng: number; lat: number } | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null)
  const [hasUnsavedMarkerChanges, setHasUnsavedMarkerChanges] = useState(false)
  const [showCoordinates, setShowCoordinates] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [routeColors, setRouteColors] = useState(getRouteColors)

  const getInitialScaleUnit = (): ScaleUnit => {
    const stored = localStorage.getItem('nomad:map-scale-unit')

    return stored === 'metric' || stored === 'imperial' || stored === 'nautical' ? stored : 'metric'
  }

  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>(getInitialScaleUnit)

  // Resolve the initial view once at mount: saved view → default. Lazy so it isn't recomputed
  // on every render.
  const [initialViewState] = useState(() => getSavedMapView() ?? DEFAULT_MAP_VIEW)

  const [cursorLngLat, setCursorLngLat] = useState<{
    lng: number
    lat: number
    x: number
    y: number
  } | null>(null)

  const hideCoordinates = useCallback(() => {
    setShowCoordinates(false)
    setCursorLngLat(null)
  }, [])

  const flyToLocationParams = useCallback(() => {
    const location = getMapLocationParams()
    if (!location) return

    mapRef.current?.flyTo({
      center: [location.lng, location.lat],
      zoom: location.zoom,
      duration: 1500,
    })
  }, [])

  const confirmDiscardMarkerChanges = useCallback(() => {
    if (!hasUnsavedMarkerChanges) return true
    return window.confirm('Discard unsaved marker changes?')
  }, [hasUnsavedMarkerChanges])

  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)

    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  useEffect(() => {
    const observer = new MutationObserver(() => setRouteColors(getRouteColors()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    })
    return () => observer.disconnect()
  }, [])

  const fitMapBounds = useCallback((bounds: [number, number, number, number]) => {
    const map = mapRef.current
    const frame = mapFramingBounds(bounds)
    if (!map || !frame) return
    const [west, south, east, north] = frame
    const wideScreen = map.getContainer().clientWidth >= 768
    try {
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: {
            top: wideScreen ? 100 : 190,
            bottom: 80,
            left: 50,
            right: wideScreen ? 400 : 50,
          },
          maxZoom: 16,
          duration: 900,
        }
      )
    } catch (error) {
      console.warn('Unable to frame the selected map area.', error)
    }
  }, [])

  useEffect(() => {
    if (!mapLoaded || !route) return
    const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [longitude, latitude] of route.geometry.coordinates) {
      bounds[0] = Math.min(bounds[0], longitude)
      bounds[1] = Math.min(bounds[1], latitude)
      bounds[2] = Math.max(bounds[2], longitude)
      bounds[3] = Math.max(bounds[3], latitude)
    }
    if (bounds.every(Number.isFinite)) fitMapBounds(bounds)
  }, [route, mapLoaded, fitMapBounds])

  useEffect(() => {
    if (mapLoaded && boundsCommand) fitMapBounds(boundsCommand.bounds)
  }, [boundsCommand, mapLoaded, fitMapBounds])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!mapCommand) return
    if (handledMapCommandIdRef.current === mapCommand.id) return

    handledMapCommandIdRef.current = mapCommand.id

    if (mapCommand.action === 'fly') {
      const currentZoom = mapRef.current?.getZoom() ?? 12

      setTargetIndicator({
        lng: mapCommand.lng,
        lat: mapCommand.lat,
      })

      mapRef.current?.flyTo({
        center: [mapCommand.lng, mapCommand.lat],
        zoom: currentZoom,
        duration: 1500,
      })

      return
    }

    if (mapCommand.action === 'marker') {
      if (!confirmDiscardMarkerChanges()) return

      setTargetIndicator(null)

      const currentZoom = mapRef.current?.getZoom() ?? 12

      mapRef.current?.flyTo({
        center: [mapCommand.lng, mapCommand.lat],
        zoom: currentZoom,
        duration: 750,
      })

      window.setTimeout(() => {
        setPlacingMarker({
          lng: mapCommand.lng,
          lat: mapCommand.lat,
        })

        setSelectedMarkerId(null)
        setEditingMarkerId(null)
        setHasUnsavedMarkerChanges(false)
      }, 750)
    }
  }, [mapCommand, confirmDiscardMarkerChanges])

  useEffect(() => {
    if (!selectedMarkerId) return

    const marker = markers.find((existingMarker) => existingMarker.id === selectedMarkerId)

    if (!marker || marker.visible === false) {
      setSelectedMarkerId(null)
      setEditingMarkerId(null)
    }
  }, [markers, selectedMarkerId])

  const handleScaleUnitChange = useCallback((unit: ScaleUnit) => {
    setScaleUnit(unit)
    localStorage.setItem('nomad:map-scale-unit', unit)
  }, [])

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true)
    flyToLocationParams()
    const center = mapRef.current?.getCenter()
    const bounds = mapRef.current?.getBounds()
    if (center)
      onViewChange?.({
        lat: center.lat,
        lon: center.lng,
        bounds: bounds
          ? normalizedMapBounds([
              bounds.getWest(),
              bounds.getSouth(),
              bounds.getEast(),
              bounds.getNorth(),
            ])
          : undefined,
      })
  }, [flyToLocationParams, onViewChange])

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!confirmDiscardMarkerChanges()) return
      const point = normalizeMapEventPoint({ lat: e.lngLat.lat, lon: e.lngLat.lng })

      if (pickingRoutePoint && onRoutePoint) {
        onRoutePoint(point)
        setPlacingMarker(null)
        setSelectedMarkerId(null)
        setEditingMarkerId(null)
        setHasUnsavedMarkerChanges(false)
        setTargetIndicator(null)
        return
      }

      setPlacingMarker({ lng: point.lon, lat: point.lat })
      setSelectedMarkerId(null)
      setEditingMarkerId(null)
      setHasUnsavedMarkerChanges(false)
      setTargetIndicator(null)
    },
    [confirmDiscardMarkerChanges, pickingRoutePoint, onRoutePoint]
  )

  const copyPoint = useCallback(async (point: RoutePoint) => {
    const value = formatMapPoint(point)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setClipboardNotice({ value, copied: true })
    } catch {
      setClipboardNotice({ value, copied: false })
    }
  }, [])

  useEffect(() => {
    if (!clipboardNotice?.copied) return
    const timer = window.setTimeout(() => setClipboardNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [clipboardNotice])

  const handleContextMenu = useCallback(
    (event: MapLayerMouseEvent) => {
      const target = event.originalEvent.target as HTMLElement | null
      if (target?.closest('.maplibregl-ctrl,.maplibregl-popup,input,button,a,textarea')) return
      event.originalEvent.preventDefault()
      const gesture = rightGesture.current
      if (!gesture || gesture.moved || gesture.copied) return
      const point = normalizeMapEventPoint({ lat: event.lngLat.lat, lon: event.lngLat.lng })
      // MapLibre may defer a mousedown contextmenu until after mouseup while
      // preserving the original event's buttons=2 (macOS/Linux).
      if (!gesture.released && event.originalEvent.buttons & 2) gesture.pending = point
      else {
        gesture.copied = true
        void copyPoint(point)
      }
    },
    [copyPoint]
  )

  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const target = e.originalEvent.target as HTMLElement | null

      if (
        !showCoordinatesEnabled ||
        isHoveringUI ||
        isDraggingMap ||
        target?.closest('.maplibregl-control-container, .maplibregl-ctrl')
      ) {
        hideCoordinates()
        return
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const point = normalizeMapEventPoint({ lat: e.lngLat.lat, lon: e.lngLat.lng })
        setShowCoordinates(true)
        setCursorLngLat({
          lng: point.lon,
          lat: point.lat,
          x: e.point.x,
          y: e.point.y,
        })
      })
    },
    [hideCoordinates, isHoveringUI, isDraggingMap, showCoordinatesEnabled]
  )

  const handleFlyTo = useCallback((longitude: number, latitude: number) => {
    setTargetIndicator(null)
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 12, duration: 1500 })
  }, [])

  const handleDeleteMarker = useCallback(
    (id: number) => {
      if (selectedMarkerId === id) setSelectedMarkerId(null)
      if (editingMarkerId === id) setEditingMarkerId(null)

      deleteMarker(id)
    },
    [selectedMarkerId, editingMarkerId, deleteMarker]
  )

  const selectedMarker = selectedMarkerId
    ? markers.find((marker) => marker.id === selectedMarkerId && isValidMarkerCoordinate(marker))
    : null

  return (
    <MapProvider>
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onMouseLeave={() => {
          if (rightGesture.current) rightGesture.current.moved = true
          setIsDraggingMap(false)
          hideCoordinates()
        }}
        onMouseMoveCapture={(e) => {
          if (
            rightGesture.current &&
            !rightGesture.current.released &&
            mapPointerMoved(rightGesture.current, { x: e.clientX, y: e.clientY })
          )
            rightGesture.current.moved = true
          const target = e.target as HTMLElement | null

          if (
            target?.closest(
              '.maplibregl-control-container, .maplibregl-ctrl, .maplibregl-ctrl-group, .maplibregl-ctrl-scale'
            )
          ) {
            hideCoordinates()
          }
        }}
      >
        <Map
          ref={mapRef}
          reuseMaps
          style={{ width: '100%', height: '100%' }}
          cursor={isDraggingMap ? 'grabbing' : 'crosshair'}
          mapStyle={`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/maps/styles`}
          mapLib={maplibregl}
          initialViewState={initialViewState}
          onMoveEnd={(e) => {
            // Persist the view so a refresh restores where the user was, not the default.
            const { longitude, latitude, zoom } = e.viewState
            const bounds = mapRef.current?.getBounds()
            onViewChange?.({
              lat: latitude,
              lon: longitude,
              bounds: bounds
                ? normalizedMapBounds([
                    bounds.getWest(),
                    bounds.getSouth(),
                    bounds.getEast(),
                    bounds.getNorth(),
                  ])
                : undefined,
            })
            try {
              localStorage.setItem(
                SAVED_MAP_VIEW_KEY,
                JSON.stringify({ longitude, latitude, zoom })
              )
            } catch {
              // ignore persistence failures (private mode, quota)
            }
          }}
          onLoad={handleMapLoad}
          onMouseDown={(event) => {
            if (event.originalEvent.button === 2)
              rightGesture.current = {
                x: event.originalEvent.clientX,
                y: event.originalEvent.clientY,
                moved: false,
                copied: false,
                released: false,
              }
            setIsDraggingMap(true)
            hideCoordinates()
          }}
          onMouseUp={(event) => {
            setIsDraggingMap(false)
            const gesture = rightGesture.current
            if (event.originalEvent.button === 2 && gesture) gesture.released = true
            if (
              event.originalEvent.button === 2 &&
              gesture?.pending &&
              !gesture.moved &&
              !gesture.copied
            ) {
              gesture.copied = true
              void copyPoint(gesture.pending)
            }
          }}
          onDragStart={() => {
            if (rightGesture.current) rightGesture.current.moved = true
            setIsDraggingMap(true)
            hideCoordinates()
          }}
          onDragEnd={() => {
            setIsDraggingMap(false)
            hideCoordinates()
          }}
          onClick={handleMapClick}
          onContextMenu={handleContextMenu}
          onMouseMove={handleMouseMove}
          onMouseLeave={hideCoordinates}
        >
          <NavigationControl
            position="bottom-right"
            style={{ marginBottom: '16px', marginRight: '16px' }}
          />
          <FullscreenControl
            position="bottom-right"
            style={{ marginBottom: '32px', marginRight: '16px' }}
          />
          <ScaleControl position="bottom-left" maxWidth={150} unit={scaleUnit} />

          {route && (
            <Source
              id="offline-route"
              type="geojson"
              data={{ type: 'Feature', geometry: route.geometry, properties: {} }}
            >
              <Layer
                id="offline-route-halo"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': routeColors.halo, 'line-width': 8, 'line-opacity': 0.9 }}
              />
              <Layer
                id="offline-route-line"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': routeColors.line, 'line-width': 5 }}
              />
            </Source>
          )}

          {routePoints?.map(
            ({ id, point, label, placeLabel, placePrecision, placeSource }, index) => {
              if (!point) return null
              return (
                <Marker
                  key={id}
                  longitude={point.lon}
                  latitude={point.lat}
                  anchor="center"
                  onClick={(event) => {
                    event.originalEvent.stopPropagation()
                    if (pickingRoutePoint && onRoutePoint && confirmDiscardMarkerChanges())
                      onRoutePoint({
                        ...point,
                        label: placeLabel,
                        precision: placePrecision,
                        source: placeSource,
                      })
                  }}
                >
                  <div
                    aria-label={`Route ${label}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface-primary text-sm font-bold text-white shadow-lg ${index === 0 ? 'bg-desert-green' : 'bg-desert-orange'}`}
                  >
                    {String.fromCharCode(65 + index)}
                  </div>
                </Marker>
              )
            }
          )}

          {showCoordinates && cursorLngLat && (
            <CoordinateOverlay
              latitude={cursorLngLat.lat}
              longitude={cursorLngLat.lng}
              x={cursorLngLat.x}
              y={cursorLngLat.y}
            />
          )}

          {targetIndicator && (
            <Marker longitude={targetIndicator.lng} latitude={targetIndicator.lat} anchor="center">
              <div
                className="pointer-events-none flex h-9 w-9 items-center justify-center rounded-full border-2 border-desert-orange bg-surface-primary/70 shadow-lg"
                aria-hidden="true"
              >
                <div className="relative h-5 w-5">
                  <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-desert-orange" />
                  <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-desert-orange" />
                </div>
              </div>
            </Marker>
          )}

          <ScaleUnitToggle
            scaleUnit={scaleUnit}
            onChange={handleScaleUnitChange}
            onMouseEnter={hideCoordinates}
          />

          {markers
            .filter((marker) => marker.visible)
            .map((marker) => (
              <Marker
                key={marker.id}
                longitude={marker.longitude}
                latitude={marker.latitude}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation()

                  if (!confirmDiscardMarkerChanges()) return
                  if (pickingRoutePoint && onRoutePoint) {
                    onRoutePoint({
                      lat: marker.latitude,
                      lon: marker.longitude,
                      label: marker.name,
                      precision: 'saved point',
                      source: 'Saved pin',
                    })
                    return
                  }

                  setSelectedMarkerId(marker.id === selectedMarkerId ? null : marker.id)
                  setPlacingMarker(null)
                  setEditingMarkerId(null)
                  setHasUnsavedMarkerChanges(false)
                  setTargetIndicator(null)
                }}
              >
                <MarkerPin
                  color={marker.color}
                  customColor={marker.customColor}
                  icon={marker.icon}
                  iconColor={marker.iconColor}
                  visible={marker.visible}
                  active={marker.id === selectedMarkerId}
                />
              </Marker>
            ))}

          {placingMarker && (
            <MapMarkerFormPopup
              longitude={placingMarker.lng}
              latitude={placingMarker.lat}
              onDirtyChange={setHasUnsavedMarkerChanges}
              onMouseEnter={hideCoordinates}
              onSave={async ({ name, notes, color, customColor, icon }) => {
                const saved = await addMarker({
                  name,
                  longitude: placingMarker.lng,
                  latitude: placingMarker.lat,
                  color,
                  customColor,
                  icon,
                  notes: notes || null,
                })

                // Leave the popup open on failure. api.ts already surfaces the
                // error toast, but closing here would throw away what was typed
                // with nothing to retry against.
                if (!saved) return

                setPlacingMarker(null)
                setHasUnsavedMarkerChanges(false)
                setTargetIndicator(null)
              }}
              onCancel={() => {
                if (!confirmDiscardMarkerChanges()) return

                setPlacingMarker(null)
                setEditingMarkerId(null)
                setHasUnsavedMarkerChanges(false)
                setTargetIndicator(null)
              }}
            />
          )}

          {selectedMarker && editingMarkerId !== selectedMarker.id && (
            <ViewMapMarkerPopup
              marker={selectedMarker}
              onClose={() => setSelectedMarkerId(null)}
              onEdit={() => setEditingMarkerId(selectedMarker.id)}
              onMouseEnter={hideCoordinates}
            />
          )}

          {selectedMarker && editingMarkerId === selectedMarker.id && (
            <MapMarkerFormPopup
              longitude={selectedMarker.longitude}
              latitude={selectedMarker.latitude}
              initialMarker={selectedMarker}
              onDirtyChange={setHasUnsavedMarkerChanges}
              onMouseEnter={hideCoordinates}
              onSave={async ({ id, name, notes, color, customColor, icon }) => {
                if (!id) return

                const saved = await updateMarker(id, {
                  name,
                  notes: notes || null,
                  color,
                  customColor,
                  icon,
                })

                if (!saved) return

                setEditingMarkerId(null)
                setHasUnsavedMarkerChanges(false)
              }}
              onCancel={() => {
                if (!confirmDiscardMarkerChanges()) return

                setEditingMarkerId(null)
                setHasUnsavedMarkerChanges(false)
              }}
            />
          )}
        </Map>
      </div>

      <div
        onMouseEnter={hideCoordinates}
        className={routePanelOpen ? 'hidden md:block' : undefined}
      >
        <MarkerPanel
          markers={markers}
          onDelete={handleDeleteMarker}
          onFlyTo={handleFlyTo}
          onSelect={setSelectedMarkerId}
          routeSelectionLabel={pickingRoutePoint ? pickingRouteLabel : undefined}
          onChooseForRoute={
            pickingRoutePoint && onRoutePoint
              ? (marker) => {
                  if (!isValidMarkerCoordinate(marker) || !confirmDiscardMarkerChanges())
                    return false
                  onRoutePoint({
                    lat: marker.latitude,
                    lon: marker.longitude,
                    label: marker.name,
                    precision: 'saved point',
                    source: 'Saved pin',
                  })
                  setPlacingMarker(null)
                  setSelectedMarkerId(null)
                  setEditingMarkerId(null)
                  setHasUnsavedMarkerChanges(false)
                  setTargetIndicator(null)
                  return true
                }
              : undefined
          }
          selectedMarkerId={selectedMarkerId}
          onToggleVisibility={(id, visible) => updateMarker(id, { visible })}
        />
      </div>

      {clipboardNotice && (
        <div
          className="absolute bottom-12 left-4 z-50 max-w-[calc(100%-2rem)] rounded border border-border-default bg-surface-primary p-3 text-sm text-text-primary shadow-lg"
          role="status"
        >
          <div className="flex items-center justify-between gap-3">
            <span>
              {clipboardNotice.copied
                ? 'Coordinates copied'
                : 'Select these coordinates and press Ctrl+C'}
            </span>
            <button
              aria-label="Dismiss coordinate copy notice"
              onClick={() => setClipboardNotice(null)}
            >
              ×
            </button>
          </div>
          {clipboardNotice.copied ? (
            <code className="mt-1 block">{clipboardNotice.value}</code>
          ) : (
            <input
              aria-label="Coordinates to copy"
              className="mt-2 w-full select-all rounded border border-border-default bg-surface-secondary px-2 py-1"
              readOnly
              value={clipboardNotice.value}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
            />
          )}
        </div>
      )}
    </MapProvider>
  )
}
