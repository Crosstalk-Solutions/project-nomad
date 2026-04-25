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

type ScaleUnit = 'imperial' | 'metric'

import { useMapMarkers, PIN_COLORS } from '~/hooks/useMapMarkers'
import type { PinColorId } from '~/hooks/useMapMarkers'
import MarkerPin from './MarkerPin'
import MarkerPanel from './MarkerPanel'

export default function MapComponent({ isHoveringUI, showCoordinatesEnabled, }: {isHoveringUI: boolean, showCoordinatesEnabled: boolean}) {
  const mapRef = useRef<MapRef>(null)
  const { markers, addMarker, deleteMarker } = useMapMarkers()

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

  const toggleScaleUnit = useCallback(() => {
    setScaleUnit((prev) => {
      const next = prev === 'metric' ? 'imperial' : 'metric'
      localStorage.setItem('nomad:map-scale-unit', next)
      return next
    })
  }, [])

  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)

    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  const hideCoordinates = useCallback(() => {
    setShowCoordinates(false)
    setCursorLngLat(null)
  }, [])

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
     const target = e.originalEvent.target as HTMLElement | null

    if (target?.closest('.maplibregl-control-container, .maplibregl-ctrl')) {
      hideCoordinates()
      return
    }

   if (!showCoordinatesEnabled || 
       isHoveringUI ||
       target?.closest('.maplibregl-control-container, .maplibregl-ctrl')
  ) {
     hideCoordinates()
     return
   }

    setShowCoordinates(true)
    setCursorLngLat({
      lng: e.lngLat.lng,
      lat: e.lngLat.lat,
      x: e.point.x,
      y: e.point.y,
    })
  }, [hideCoordinates, isHoveringUI])

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
      onMouseLeave={hideCoordinates}
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
        style={{
          width: '100%',
          height: '100vh',
        }}
        cursor="crosshair"
        mapStyle={`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/maps/styles`}
        mapLib={maplibregl}
        initialViewState={{
          longitude: -101,
          latitude: 40,
          zoom: 3.5,
        }}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={hideCoordinates}
      >
        <NavigationControl style={{ marginTop: '110px', marginRight: '36px' }} />
        <FullscreenControl style={{ marginTop: '30px', marginRight: '36px' }} />
        <ScaleControl position="bottom-left" maxWidth={150} unit={scaleUnit} />

        {showCoordinates && showCoordinates && cursorLngLat && (
          <div
            style={{
              position: 'absolute',
              left: cursorLngLat.x,
              top: cursorLngLat.y - 36,
              transform: 'translateX(-50%)',
              zIndex: 9999,
              pointerEvents: 'none',
              background: 'rgba(0, 0, 0, 0.75)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {cursorLngLat.lat.toFixed(6)}, {cursorLngLat.lng.toFixed(6)}
          </div>
        )}

        <div style={{ position: 'absolute', bottom: '30px', left: '10px', zIndex: 2 }}>
          <div
            onMouseEnter={hideCoordinates}
            style={{
              display: 'inline-flex',
              borderRadius: '4px',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              fontSize: '11px',
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            <button
              onClick={() => {
                if (scaleUnit !== 'metric') toggleScaleUnit()
              }}
              style={{
                background: scaleUnit === 'metric' ? '#424420' : 'white',
                color: scaleUnit === 'metric' ? 'white' : '#666',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Metric
            </button>

            <button
              onClick={() => {
                if (scaleUnit !== 'imperial') toggleScaleUnit()
              }}
              style={{
                background: scaleUnit === 'imperial' ? '#424420' : 'white',
                color: scaleUnit === 'imperial' ? 'white' : '#666',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Imperial
            </button>
          </div>
        </div>

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
            offset={[0, -36] as [number, number]}
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
                  onClick={() => setPlacingMarker(null)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
                >
                  Cancel
                </button>

                <button
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
