import Map, {
  FullscreenControl,
  NavigationControl,
  ScaleControl,
  Marker,
  Popup,
  MapProvider,
} from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { PMTiles, Protocol } from 'pmtiles'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'

import { useMapMarkers, PIN_COLORS } from '~/hooks/useMapMarkers'
import type { PinColorId } from '~/hooks/useMapMarkers'
import type { FileEntry } from '../../../types/files'

import MarkerPin from './MarkerPin'
import MarkerPanel from './MarkerPanel'
import CoordinateOverlay from './CoordinateOverlay'
import ScaleUnitToggle from './ScaleUnitToggle'

type ScaleUnit = 'imperial' | 'metric'

type MapComponentProps = {
  isHoveringUI: boolean
  showCoordinatesEnabled: boolean
  regionFiles: FileEntry[]
}

const SAVED_MAP_VIEW_KEY = 'nomad:map-view'
const DEFAULT_MAP_VIEW = { longitude: -101, latitude: 40, zoom: 3.5 }

type SavedMapView = { longitude: number; latitude: number; zoom: number }

const getRegionLabel = (filename: string) => {
  const slug = filename
    .replace(/\.pmtiles$/i, '')
    .replace(/_\d{4}-\d{2}$/i, '')
    .replace(/_[\d-]+_z\d+$/i, '')

  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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

export default function MapComponent({
  isHoveringUI,
  showCoordinatesEnabled,
  regionFiles,
}: MapComponentProps) {
  const mapRef = useRef<MapRef>(null)
  const animationFrameRef = useRef<number | null>(null)

  const { markers, addMarker, deleteMarker } = useMapMarkers()

  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [placingMarker, setPlacingMarker] = useState<{ lng: number; lat: number } | null>(null)
  const [markerName, setMarkerName] = useState('')
  const [markerNotes, setMarkerNotes] = useState('')
  const [markerColor, setMarkerColor] = useState<PinColorId>('orange')
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)

  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>(
    () => (localStorage.getItem('nomad:map-scale-unit') as ScaleUnit) || 'metric'
  )

  // Resolve the initial view once at mount: saved view → default. Lazy so it isn't recomputed
  // on every render.
  const [initialViewState] = useState(() => getSavedMapView() ?? DEFAULT_MAP_VIEW)

  const [cursorLngLat, setCursorLngLat] = useState<{
    lng: number
    lat: number
    x: number
    y: number
  } | null>(null)

  const [showCoordinates, setShowCoordinates] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState('')
  const [isNavigatingToRegion, setIsNavigatingToRegion] = useState(false)
  const [regionNavigationError, setRegionNavigationError] = useState<string | null>(null)

  const installedRegions = useMemo(
    () =>
      regionFiles
        .filter((file): file is Extract<FileEntry, { type: 'file' }> => file.type === 'file')
        .map((file) => ({ filename: file.name, label: getRegionLabel(file.name) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [regionFiles]
  )

  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)

    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const hideCoordinates = useCallback(() => {
    setShowCoordinates(false)
    setCursorLngLat(null)
  }, [])

  const handleScaleUnitChange = useCallback((unit: ScaleUnit) => {
    setScaleUnit(unit)
    localStorage.setItem('nomad:map-scale-unit', unit)
  }, [])

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

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    setPlacingMarker({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    setMarkerName('')
    setMarkerNotes('')
    setMarkerColor('orange')
    setSelectedMarkerId(null)
  }, [])

  const handleSaveMarker = useCallback(() => {
    if (placingMarker && markerName.trim()) {
      const trimmedNotes = markerNotes.trim()
      addMarker(
        markerName.trim(),
        placingMarker.lng,
        placingMarker.lat,
        markerColor,
        trimmedNotes ? trimmedNotes : null
      )
      setPlacingMarker(null)
      setMarkerName('')
      setMarkerNotes('')
      setMarkerColor('orange')
    }
  }, [placingMarker, markerName, markerNotes, markerColor, addMarker])

  const handleFlyTo = useCallback((longitude: number, latitude: number) => {
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 12, duration: 1500 })
  }, [])

  const handleRegionChange = useCallback(async (filename: string) => {
    setSelectedRegion(filename)
    setRegionNavigationError(null)
    if (!filename) return

    setIsNavigatingToRegion(true)
    try {
      const archiveUrl = `${window.location.origin}/pmtiles/${encodeURIComponent(filename)}`
      const header = await new PMTiles(archiveUrl).getHeader()
      mapRef.current?.fitBounds(
        [
          [header.minLon, header.minLat],
          [header.maxLon, header.maxLat],
        ],
        {
          padding: { top: 150, right: 50, bottom: 50, left: 50 },
          maxZoom: 8,
          duration: 1200,
        }
      )
    } catch (error) {
      console.error('Failed to read map region bounds:', error)
      setRegionNavigationError('Could not open that downloaded map.')
    } finally {
      setIsNavigatingToRegion(false)
    }
  }, [])

  const handleDeleteMarker = useCallback(
    (id: number) => {
      if (selectedMarkerId === id) setSelectedMarkerId(null)
      deleteMarker(id)
    },
    [selectedMarkerId, deleteMarker]
  )

  const selectedMarker = selectedMarkerId ? markers.find((m) => m.id === selectedMarkerId) : null

  return (
    <MapProvider>
      <div
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
          ref={mapRef}
          reuseMaps
          style={{ width: '100%', height: '100vh' }}
          cursor={isDraggingMap ? 'grabbing' : 'crosshair'}
          mapStyle={`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/maps/styles`}
          mapLib={maplibregl}
          initialViewState={initialViewState}
          onMoveEnd={(e) => {
            // Persist the view so a refresh restores where the user was, not the default.
            const { longitude, latitude, zoom } = e.viewState
            try {
              localStorage.setItem(
                SAVED_MAP_VIEW_KEY,
                JSON.stringify({ longitude, latitude, zoom })
              )
            } catch {
              // ignore persistence failures (private mode, quota)
            }
          }}
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
          <NavigationControl style={{ marginTop: '110px', marginRight: '36px' }} />
          <FullscreenControl style={{ marginTop: '30px', marginRight: '36px' }} />
          <ScaleControl position="bottom-left" maxWidth={150} unit={scaleUnit} />

          {showCoordinates && cursorLngLat && (
            <CoordinateOverlay
              latitude={cursorLngLat.lat}
              longitude={cursorLngLat.lng}
              x={cursorLngLat.x}
              y={cursorLngLat.y}
            />
          )}

          <ScaleUnitToggle
            scaleUnit={scaleUnit}
            onChange={handleScaleUnitChange}
            onMouseEnter={hideCoordinates}
          />

          {markers.map((marker) => (
            <Marker
              key={marker.id}
              longitude={marker.longitude}
              latitude={marker.latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                setSelectedMarkerId(marker.id === selectedMarkerId ? null : marker.id)
                setPlacingMarker(null)
              }}
            >
              <MarkerPin
                color={PIN_COLORS.find((c) => c.id === marker.color)?.hex}
                active={marker.id === selectedMarkerId}
              />
            </Marker>
          ))}

          {selectedMarker && (
            <Popup
              longitude={selectedMarker.longitude}
              latitude={selectedMarker.latitude}
              anchor="bottom"
              offset={[0, -36]}
              onClose={() => setSelectedMarkerId(null)}
              closeOnClick={false}
            >
              <div className="text-sm font-medium">{selectedMarker.name}</div>
              {selectedMarker.notes && selectedMarker.notes.trim() && (
                <div className="mt-1 text-xs text-desert-stone-dark whitespace-pre-wrap break-words max-w-[240px]">
                  {selectedMarker.notes}
                </div>
              )}
            </Popup>
          )}

          {placingMarker && (
            <Popup
              longitude={placingMarker.lng}
              latitude={placingMarker.lat}
              anchor="bottom"
              onClose={() => setPlacingMarker(null)}
              closeOnClick={false}
            >
              <div onMouseEnter={hideCoordinates} className="p-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="Name this location"
                  value={markerName}
                  onChange={(e) => setMarkerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveMarker()
                    if (e.key === 'Escape') setPlacingMarker(null)
                  }}
                  className="block w-full rounded border border-gray-300 px-2 py-1 text-sm placeholder:text-gray-400 focus:outline-none focus:border-gray-500"
                />

                <textarea
                  placeholder="Notes (optional)"
                  value={markerNotes}
                  onChange={(e) => setMarkerNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setPlacingMarker(null)
                  }}
                  rows={2}
                  className="mt-1.5 block w-full resize-y rounded border border-gray-300 px-2 py-1 text-sm placeholder:text-gray-400 focus:outline-none focus:border-gray-500"
                />

                <div className="mt-1.5 flex gap-1 items-center">
                  {PIN_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setMarkerColor(c.id)}
                      title={c.label}
                      className="rounded-full p-0.5 transition-transform"
                      style={{
                        outline:
                          markerColor === c.id ? `2px solid ${c.hex}` : '2px solid transparent',
                        outlineOffset: '1px',
                      }}
                    >
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.hex }} />
                    </button>
                  ))}
                </div>

                <div className="mt-1.5 flex gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => setPlacingMarker(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveMarker}
                    disabled={!markerName.trim()}
                    className="text-xs bg-[#424420] text-white rounded px-2.5 py-1 hover:bg-[#525530] disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </Popup>
          )}
        </Map>

        {installedRegions.length > 0 && (
          <div className="absolute left-4 top-[124px] z-40 min-w-64 rounded-lg border border-border-default bg-surface-secondary/95 p-3 shadow-lg backdrop-blur-sm">
            <label
              htmlFor="map-region-select"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Jump to downloaded region
            </label>
            <select
              id="map-region-select"
              value={selectedRegion}
              disabled={isNavigatingToRegion}
              onChange={(event) => void handleRegionChange(event.target.value)}
              className="w-full rounded-md border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-desert-green disabled:opacity-60"
            >
              <option value="">
                {isNavigatingToRegion ? 'Opening region…' : 'Choose a region…'}
              </option>
              {installedRegions.map((region) => (
                <option key={region.filename} value={region.filename}>
                  {region.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">Zoom in further for streets and places.</p>
            {regionNavigationError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {regionNavigationError}
              </p>
            )}
          </div>
        )}
      </div>

      <div onMouseEnter={hideCoordinates}>
        <MarkerPanel
          markers={markers}
          onDelete={handleDeleteMarker}
          onFlyTo={handleFlyTo}
          onSelect={setSelectedMarkerId}
          selectedMarkerId={selectedMarkerId}
        />
      </div>
    </MapProvider>
  )
}
