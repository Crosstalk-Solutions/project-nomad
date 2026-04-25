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

import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState, useCallback } from 'react'

import { useMapMarkers, PIN_COLORS } from '~/hooks/useMapMarkers'
import type { PinColorId } from '~/hooks/useMapMarkers'

import MarkerPin from './MarkerPin'
import MarkerPanel from './MarkerPanel'
import CoordinateOverlay from './CoordinateOverlay'
import ScaleUnitToggle from './ScaleUnitToggle'

type ScaleUnit = 'imperial' | 'metric'

type MapComponentProps = {
  isHoveringUI: boolean
  showCoordinatesEnabled: boolean
}

export default function MapComponent({
  isHoveringUI,
  showCoordinatesEnabled,
}: MapComponentProps) {
  const mapRef = useRef<MapRef>(null)
  const animationFrameRef = useRef<number | null>(null)

  const { markers, addMarker, deleteMarker } = useMapMarkers()

  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [placingMarker, setPlacingMarker] = useState<{ lng: number; lat: number } | null>(null)
  const [markerName, setMarkerName] = useState('')
  const [markerColor, setMarkerColor] = useState<PinColorId>('orange')
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)

  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>(
    () => (localStorage.getItem('nomad:map-scale-unit') as ScaleUnit) || 'metric'
  )

  const [cursorLngLat, setCursorLngLat] = useState<{
    lng: number
    lat: number
    x: number
    y: number
  } | null>(null)

  const [showCoordinates, setShowCoordinates] = useState(false)

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
    setMarkerColor('orange')
    setSelectedMarkerId(null)
  }, [])

  const handleSaveMarker = useCallback(() => {
    if (placingMarker && markerName.trim()) {
      addMarker(markerName.trim(), placingMarker.lng, placingMarker.lat, markerColor)
      setPlacingMarker(null)
      setMarkerName('')
      setMarkerColor('orange')
    }
  }, [placingMarker, markerName, markerColor, addMarker])

  const handleFlyTo = useCallback((longitude: number, latitude: number) => {
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 12, duration: 1500 })
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
          initialViewState={{
            longitude: -101,
            latitude: 40,
            zoom: 3.5,
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
