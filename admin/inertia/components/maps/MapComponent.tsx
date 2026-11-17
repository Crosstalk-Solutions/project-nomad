import Map, {
  FullscreenControl,
  Marker,
  MapProvider,
  NavigationControl,
  ScaleControl,
} from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { PMTiles, Protocol } from 'pmtiles'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useMapMarkers } from '~/hooks/useMapMarkers'

import MarkerPin from './MarkerPin'
import MarkerPanel from './MarkerPanel'
import CoordinateOverlay from './CoordinateOverlay'
import ViewMapMarkerPopup from './ViewMapMarkerPopup'
import MapMarkerFormPopup from './MapMarkerFormPopup'
import ScaleUnitToggle from './ScaleUnitSelector'
import LayerSelector, { NorthUpNavigation, type MapLayerMode } from './LayerSelector'
import { ContourStatus, ElevationContourLayer, useElevationContours } from './ElevationContours'
import { coverageTarget, hasCoverage, inVisibleView, localArchiveUrl, readOfflineLayers, styleWithOfflineLayer,
  styleWithStreets, withEarthRelief, withWorldRaster, type MapCamera } from './mapLayerStyles'
import { archiveRequestUrl, useOfflineMapData } from './offlineMapData'
import './layerSelector.css'

type ScaleUnit = 'imperial' | 'metric' | 'nautical'

type MapCommand = {
  id: number
  lat: number
  lng: number
  action: 'fly' | 'marker'
}

type MapComponentProps = {
  worldOfflineEnabled?: boolean
  worldOfflineNorthLocked?: boolean
  mapCommand?: MapCommand | null
  isHoveringUI?: boolean
  showCoordinatesEnabled?: boolean
}

type MapLocationParams = {
  lat: number
  lng: number
  zoom: number
}

const SAVED_MAP_VIEW_KEY = 'nomad:map-view'
const SAVED_OFFLINE_LAYER_KEY = 'nomad:offline-map-layer'
const SAVED_STREET_OVERLAY_KEY = 'nomad:offline-map-street-overlay'
const SAVED_BLUE_MARBLE_MONTH_KEY = 'nomad:offline-map-blue-marble-month'
const EMPTY_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#cccccc' } }],
}

type LayerView = { mode: MapLayerMode; streetOverlay: boolean; month: number }
const DEFAULT_LAYER_VIEW: LayerView = { mode: 'street', streetOverlay: true, month: 12 }

function getSavedOfflineLayer(): LayerView {
  const params = new URLSearchParams(window.location.search)
  let requested = params.get('layer')
  let overlay = params.get('street')
  let month = params.get('month')
  try {
    requested ??= localStorage.getItem(SAVED_OFFLINE_LAYER_KEY) ?? localStorage.getItem('nomad:raster-lab-layer')
    overlay ??= localStorage.getItem(SAVED_STREET_OVERLAY_KEY) ?? localStorage.getItem('nomad:raster-lab-street-overlay')
    month ??= localStorage.getItem(SAVED_BLUE_MARBLE_MONTH_KEY) ?? localStorage.getItem('nomad:raster-lab-blue-marble-month')
  } catch {
    // A shared map link still applies when storage is unavailable.
  }
  const mode = requested === 'aerial' || requested === 'topographic' || requested === 'blue-marble'
    ? requested : 'street'
  const ordinal = Number(month)
  return { mode, streetOverlay: overlay !== '0',
    month: Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= 12 ? ordinal : 12 }
}
const DEFAULT_MAP_VIEW = { longitude: -101, latitude: 40, zoom: 3.5 }

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
                                       worldOfflineEnabled = false,
                                       worldOfflineNorthLocked = false,
                                       isHoveringUI = false,
                                       showCoordinatesEnabled = true,
                                     }: MapComponentProps) {
  const offlineEnabled = worldOfflineEnabled
  const northLocked = worldOfflineEnabled && worldOfflineNorthLocked
  const mapRef = useRef<MapRef | null>(null)
  const setMapRef = useCallback((ref: MapRef | null) => {
    mapRef.current = ref
    if (northLocked) {
      const map = ref?.getMap()
      map?.keyboard.disableRotation()
      map?.touchZoomRotate.disableRotation()
    }
  }, [northLocked])
  const animationFrameRef = useRef<number | null>(null)
  const handledMapCommandIdRef = useRef<number | null>(null)

  const { markers, addMarker, updateMarker, deleteMarker } = useMapMarkers()

  const [targetIndicator, setTargetIndicator] = useState<{ lng: number; lat: number } | null>(null)
  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [placingMarker, setPlacingMarker] = useState<{ lng: number; lat: number } | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null)
  const [hasUnsavedMarkerChanges, setHasUnsavedMarkerChanges] = useState(false)
  const [showCoordinates, setShowCoordinates] = useState(false)

  const getInitialScaleUnit = (): ScaleUnit => {
    const stored = localStorage.getItem('nomad:map-scale-unit')

    return stored === 'metric' || stored === 'imperial' || stored === 'nautical'
      ? stored
      : 'metric'
  }

  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>(getInitialScaleUnit)

  // Resolve the initial view once at mount: saved view → default. Lazy so it isn't recomputed
  // on every render.
  const [initialViewState] = useState(() => {
    const location = offlineEnabled ? getMapLocationParams() : null
    return location
      ? { longitude: location.lng, latitude: location.lat, zoom: location.zoom }
      : getSavedMapView() ?? DEFAULT_MAP_VIEW
  })
  const [camera, setCamera] = useState<MapCamera>(initialViewState)
  const [layerView, setLayerView] = useState(() => offlineEnabled ? getSavedOfflineLayer() : DEFAULT_LAYER_VIEW)
  const { mode: requestedMode, streetOverlay, month } = layerView
  const { style, world } = useOfflineMapData(offlineEnabled)
  const protocolRef = useRef<Protocol | null>(null)
  const registeredArchives = useRef(new Set<string>())
  const failedArchiveRef = useRef(new Set<string>())
  const [failedArchives, setFailedArchives] = useState(() => new Set<string>())

  useEffect(() => {
    const known = new Set(world.value?.flatMap(({ archives }) => archives?.map(localArchiveUrl) ?? []))
    registeredArchives.current = known
    const remaining = new Set<string>()
    for (const archive of failedArchiveRef.current) {
      if (known.has(archive)) remaining.add(archive)
      else protocolRef.current?.add(new PMTiles(archive.slice('pmtiles://'.length)))
    }
    if (remaining.size !== failedArchiveRef.current.size) {
      failedArchiveRef.current = remaining
      setFailedArchives(remaining)
    }
  }, [world.value])

  const refreshWorld = world.refresh
  const handleArchiveFailure = useCallback((url: string) => {
    const archive = archiveRequestUrl(url)
    if (!registeredArchives.current.has(archive) || failedArchiveRef.current.has(archive)) return
    const failures = new Set(failedArchiveRef.current).add(archive)
    failedArchiveRef.current = failures
    setFailedArchives(failures)
    refreshWorld()
  }, [refreshWorld])

  const retryMapData = () => {
    for (const archive of failedArchiveRef.current) {
      protocolRef.current?.add(new PMTiles(archive.slice('pmtiles://'.length)))
    }
    failedArchiveRef.current = new Set()
    setFailedArchives(failedArchiveRef.current)
    style.refresh()
    refreshWorld()
  }

  const earthRelief = world.value?.find((pack) => pack.id.startsWith('earth-relief-z'))?.archives
  const satellite = world.value?.find((pack) => pack.id.startsWith('satellite-z'))?.archives?.[0]
  const blueMarble = world.value?.find((pack) => pack.role === 'blue-marble' || pack.id === 'blue-marble')
    ?.archives?.find((archive) => archive.month === month)
  const failedEarth = !!earthRelief?.some((archive) => failedArchives.has(localArchiveUrl(archive)))
  const failedSatellite = !!satellite && failedArchives.has(localArchiveUrl(satellite))
  const failedMarble = !!blueMarble && failedArchives.has(localArchiveUrl(blueMarble))
  const usableMarble = !!blueMarble && !failedMarble
  const styleWithWorld = useMemo(() => {
    if (!style.value) return null
    let current = style.value
    if (earthRelief?.length && !failedEarth) current = withEarthRelief(current, earthRelief)
    if (satellite && !failedSatellite) current = withWorldRaster(current, 'aerial', satellite)
    if (blueMarble && usableMarble) current = withWorldRaster(current, 'blue-marble', blueMarble)
    return current
  }, [style.value, earthRelief, satellite, blueMarble, failedEarth, failedSatellite, usableMarble])
  const offlineLayers = useMemo(() => readOfflineLayers(styleWithWorld), [styleWithWorld])
  const waitingForMaps = (!style.value && !style.failed) || (!world.value && !world.failed)
  const elevationPack = world.value?.find((pack) => pack.role === 'elevation')
  const elevationOnStreet = requestedMode === 'topographic' && !!elevationPack && !offlineLayers.topographic.length
  const renderedMode = requestedMode !== 'street' && (offlineLayers[requestedMode].length || elevationOnStreet)
    ? requestedMode : 'street'
  const topographyActive = offlineEnabled && renderedMode === 'topographic'
  const showingContours = topographyActive
  const { data: contourData, result: contours, retry: retryContours } = useElevationContours(
    showingContours, camera, elevationPack?.generation || elevationPack?.id,
    elevationPack ? Number(elevationPack.id.split('-z')[1]) : undefined
  )
  const missingMode = requestedMode !== 'street' && renderedMode === 'street' && !waitingForMaps ? requestedMode : undefined
  const selectedLayers = renderedMode === 'street' ? [] : offlineLayers[renderedMode]
  const visibleRaster = selectedLayers.filter((layer) => inVisibleView(layer, camera)).map(({ id }) => id).join('|')
  const outsideCoverage = !!style.value && renderedMode !== 'street' && !elevationOnStreet && visibleRaster === ''
  const worldOverview = selectedLayers.some((layer) => layer.overview && hasCoverage(layer, camera)) &&
    !selectedLayers.some((layer) => !layer.overview && hasCoverage(layer, camera))
  const requestedArchiveFailed = (requestedMode === 'aerial' && failedSatellite)
    || (requestedMode === 'topographic' && failedEarth) || (requestedMode === 'blue-marble' && failedMarble)
  const mapDataWarning = style.failed ? 'The map style is temporarily unavailable.'
    : world.failed ? 'Offline map availability could not be checked.' : undefined
  const displayedStyle = useMemo(() => {
    if (!styleWithWorld) return EMPTY_MAP_STYLE
    if (renderedMode === 'street' || elevationOnStreet || (streetOverlay && !visibleRaster)) return styleWithStreets(styleWithWorld)
    const active = new Set(visibleRaster.split('|'))
    const rasters = offlineLayers[renderedMode].filter(({ id }) => active.has(id))
    const keepStreetLabels = rasters.some((layer) => layer.worldCover) || rasters.every((layer) => layer.overview)
    const scene = styleWithOfflineLayer(styleWithWorld, renderedMode, rasters, keepStreetLabels, streetOverlay)
    // Contour labels still need local glyphs when the Street overlay is off.
    return showingContours && styleWithWorld.glyphs ? { ...scene, glyphs: styleWithWorld.glyphs } : scene
  }, [styleWithWorld, renderedMode, offlineLayers, streetOverlay, visibleRaster, showingContours, elevationOnStreet])

  const changeLayerView = (change: Partial<LayerView>) => {
    const next = { ...layerView, ...change }
    setLayerView(next)
    try {
      localStorage.setItem(SAVED_OFFLINE_LAYER_KEY, next.mode)
      localStorage.setItem(SAVED_STREET_OVERLAY_KEY, next.streetOverlay ? '1' : '0')
      localStorage.setItem(SAVED_BLUE_MARBLE_MONTH_KEY, String(next.month))
    } catch {
      // The current selection still applies for the life of the page.
    }
    const url = new URL(window.location.href)
    if (['layer', 'street', 'month'].some((key) => url.searchParams.has(key))) {
      url.searchParams.set('layer', next.mode)
      url.searchParams.set('street', next.streetOverlay ? '1' : '0')
      url.searchParams.set('month', String(next.month))
      window.history.replaceState(window.history.state, '', url)
    }
  }

  const syncMapBounds = useCallback(() => {
    const bounds = mapRef.current?.getBounds()
    if (bounds) setCamera((previous) => ({
      ...previous,
      view: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    }))
  }, [])

  const goToCoverage = () => {
    const target = coverageTarget(selectedLayers, camera)
    if (target) mapRef.current?.flyTo({ center: [target.longitude, target.latitude], zoom: target.zoom, duration: 750 })
  }

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
    protocolRef.current = protocol
    maplibregl.addProtocol('pmtiles', offlineEnabled ? async (request, controller) => {
      try {
        return await protocol.tile(request, controller)
      } catch (error) {
        if (!controller.signal.aborted) handleArchiveFailure(request.url)
        throw error
      }
    } : protocol.tile)

    return () => {
      protocolRef.current = null
      maplibregl.removeProtocol('pmtiles')
    }
  }, [offlineEnabled, handleArchiveFailure])

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
    if (!offlineEnabled) {
      flyToLocationParams()
      return
    }
    syncMapBounds()
    const map = mapRef.current?.getMap()
    if (!map) return
    const center = map.getCenter()
    try {
      localStorage.setItem(SAVED_MAP_VIEW_KEY, JSON.stringify({
        longitude: center.lng, latitude: center.lat, zoom: map.getZoom(),
      }))
    } catch {
      // The camera still works when storage is unavailable.
    }
  }, [offlineEnabled, flyToLocationParams, syncMapBounds])

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!confirmDiscardMarkerChanges()) return

      setPlacingMarker({ lng: e.lngLat.lng, lat: e.lngLat.lat })
      setSelectedMarkerId(null)
      setEditingMarkerId(null)
      setHasUnsavedMarkerChanges(false)
      setTargetIndicator(null)
    },
    [confirmDiscardMarkerChanges]
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
        setShowCoordinates(true)
        setCursorLngLat({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
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
        className={offlineEnabled ? 'nomad-offline-map' : undefined}
        style={{ position: 'relative', width: '100%', height: '100vh' }}
        onMouseLeave={() => {
          setIsDraggingMap(false)
          hideCoordinates()
        }}
        onMouseMoveCapture={(e) => {
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
          ref={setMapRef}
          reuseMaps={!northLocked}
          style={{ width: '100%', height: '100vh' }}
          cursor={isDraggingMap ? 'grabbing' : 'crosshair'}
          mapStyle={offlineEnabled ? displayedStyle : `${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/maps/styles`}
          attributionControl={offlineEnabled ? { compact: true } : undefined}
          mapLib={maplibregl}
          initialViewState={northLocked ? { ...initialViewState, bearing: 0, pitch: 0 } : initialViewState}
          {...(northLocked ? { dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0 } : {})}
          onMoveEnd={(e) => {
            // Persist the view so a refresh restores where the user was, not the default.
            const { longitude, latitude, zoom } = e.viewState
            if (offlineEnabled) {
              const bounds = e.target.getBounds()
              setCamera({ longitude, latitude, zoom, view: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] })
            }
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
          onResize={offlineEnabled ? syncMapBounds : undefined}
          onMouseDown={() => {
            setIsDraggingMap(true)
            hideCoordinates()
          }}
          onMouseUp={() => {
            setIsDraggingMap(false)
          }}
          onDragStart={() => {
            setIsDraggingMap(true)
            hideCoordinates()
          }}
          onDragEnd={() => {
            setIsDraggingMap(false)
            hideCoordinates()
          }}
          onClick={handleMapClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={hideCoordinates}
        >
          {northLocked ? <NorthUpNavigation />
            : <NavigationControl style={{ marginTop: '110px', marginRight: '36px' }} />}
          {offlineEnabled ? <FullscreenControl /> : <FullscreenControl style={{ marginTop: '30px', marginRight: '36px' }} />}
          {offlineEnabled && <LayerSelector
            mode={renderedMode}
            missingMode={missingMode}
            checkingAvailability={waitingForMaps}
            mapDataWarning={mapDataWarning}
            archiveUnavailable={requestedArchiveFailed}
            setupEnabled
            onModeChange={(mode) => changeLayerView({ mode })}
            onRetryData={retryMapData}
            onKeepStreet={() => changeLayerView({ mode: 'street' })}
            availability={{ aerial: offlineLayers.aerial.length > 0, topographic: offlineLayers.topographic.length > 0 || !!elevationPack }}
            elevationOnStreet={elevationOnStreet}
            outsideCoverage={outsideCoverage}
            streetOverlay={streetOverlay}
            onStreetOverlayChange={(enabled) => changeLayerView({ streetOverlay: enabled })}
            onGoToCoverage={goToCoverage}
            blueMarbleAvailable={usableMarble}
            blueMarbleMonth={month}
            blueMarbleZoom={usableMarble ? blueMarble.maxzoom : undefined}
            onBlueMarbleMonthChange={(selected) => changeLayerView({ month: selected })}
            worldOverview={worldOverview}
            worldTopographyZoom={renderedMode === 'topographic' && worldOverview
              ? earthRelief?.[earthRelief.length - 1]?.maxzoom
              : undefined}
            worldSatelliteZoom={renderedMode === 'aerial' && worldOverview ? satellite?.maxzoom : undefined}
            offerWorldSatellite={!waitingForMaps && !satellite}
            elevation={{
              availability: elevationPack ? 'installed' : world.value ? 'not-installed'
                : world.failed ? 'unavailable' : 'checking',
            }}
          />}
          <ScaleControl position="bottom-left" maxWidth={150} unit={scaleUnit} />

          {showCoordinates && cursorLngLat && (
            <CoordinateOverlay
              latitude={cursorLngLat.lat}
              longitude={cursorLngLat.lng}
              x={cursorLngLat.x}
              y={cursorLngLat.y}
            />
          )}

          {contourData && (
            <ElevationContourLayer data={contourData} glyphsAvailable={!!displayedStyle.glyphs} />
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
        <ContourStatus result={contours} onRetry={retryContours} />
      </div>

      <div onMouseEnter={hideCoordinates}>
        <MarkerPanel
          markers={markers}
          onDelete={handleDeleteMarker}
          onFlyTo={handleFlyTo}
          onSelect={setSelectedMarkerId}
          selectedMarkerId={selectedMarkerId}
          onToggleVisibility={(id, visible) => updateMarker(id, { visible })}
        />
      </div>
    </MapProvider>
  )
}
