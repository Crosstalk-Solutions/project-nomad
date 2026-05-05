import Map, {
  FullscreenControl,
  NavigationControl,
  ScaleControl,
  Marker,
  MapProvider,
} from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState, useCallback } from 'react'

import { useMapMarkers, PIN_COLORS } from '~/hooks/useMapMarkers'
import MarkerPin from './MarkerPin'
import MarkerPanel from './MarkerPanel'
import CoordinateOverlay from './CoordinateOverlay'
import ViewMapMarkerPopup from './ViewMapMarkerPopup'
import MapMarkerFormPopup from './MapMarkerFormPopup'
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
  const { markers, addMarker, updateMarker, deleteMarker } = useMapMarkers()
  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [placingMarker, setPlacingMarker] = useState<{ lng: number; lat: number } | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null)
  const [hasUnsavedMarkerChanges, setHasUnsavedMarkerChanges] = useState(false)

  const hideCoordinates = useCallback(() => {
    setShowCoordinates(false)
    setCursorLngLat(null)
  }, [])

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

  const confirmDiscardMarkerChanges = useCallback(() => {
    if (!hasUnsavedMarkerChanges) return true

    return window.confirm('Discard unsaved marker changes?')
  }, [hasUnsavedMarkerChanges])

  // Add the PMTiles protocol to maplibre-gl
  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  const handleScaleUnitChange = useCallback((unit: ScaleUnit) => {
    setScaleUnit(unit)
    localStorage.setItem('nomad:map-scale-unit', unit)
  }, [])

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!confirmDiscardMarkerChanges()) return

      setPlacingMarker({ lng: e.lngLat.lng, lat: e.lngLat.lat })
      setSelectedMarkerId(null)
      setEditingMarkerId(null)
      setHasUnsavedMarkerChanges(false)
    },
    [confirmDiscardMarkerChanges]
  )

  const handleFlyTo = useCallback((longitude: number, latitude: number) => {
    mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 12, duration: 1500 })
  }, [])

  const handleDeleteMarker = useCallback(
    (id: number) => {
      if (selectedMarkerId === id) {
        setSelectedMarkerId(null)
      }

      if (editingMarkerId === id) {
        setEditingMarkerId(null)
      }

      deleteMarker(id)
    },
    [selectedMarkerId, editingMarkerId, deleteMarker]
  )

  const selectedMarker = selectedMarkerId ? markers.find((marker) => marker.id === selectedMarkerId) : null

  return (
    <MapProvider>
      <Map
        ref={mapRef}
        reuseMaps
        style={{
          width: '100%',
          height: '100vh',
        }}
        mapStyle={`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/maps/styles`}
        mapLib={maplibregl}
        initialViewState={{
          longitude: -101,
          latitude: 40,
          zoom: 3.5,
        }}
        onClick={handleMapClick}
      >
        <NavigationControl style={{ marginTop: '110px', marginRight: '36px' }} />
        <FullscreenControl style={{ marginTop: '30px', marginRight: '36px' }} />
        <ScaleControl position="bottom-left" maxWidth={150} unit={scaleUnit} />
        <ScaleUnitToggle scaleUnit={scaleUnit} onChange={handleScaleUnitChange} />

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
            onSave={async ({ name, notes, color, customColor, icon }) => {
              await addMarker({
                name,
                longitude: placingMarker.lng,
                latitude: placingMarker.lat,
                color,
                customColor,
                icon,
                notes: notes || null,
              })

              setPlacingMarker(null)
              setHasUnsavedMarkerChanges(false)
            }}
            onCancel={() => {
              if (!confirmDiscardMarkerChanges()) return

              setPlacingMarker(null)
              setEditingMarkerId(null)
              setHasUnsavedMarkerChanges(false)
            }}
          />
        )}

        {selectedMarker && editingMarkerId !== selectedMarker.id && (
          <ViewMapMarkerPopup
            marker={selectedMarker}
            onClose={() => setSelectedMarkerId(null)}
            onEdit={() => setEditingMarkerId(selectedMarker.id)}
          />
        )}

        {selectedMarker && editingMarkerId === selectedMarker.id && (
          <MapMarkerFormPopup
            longitude={selectedMarker.longitude}
            latitude={selectedMarker.latitude}
            initialMarker={selectedMarker}
            onDirtyChange={setHasUnsavedMarkerChanges}
            onSave={async ({ id, name, notes, color, customColor, icon }) => {
              if (!id) return

              await updateMarker(id, {
                name,
                notes: notes || null,
                color,
                customColor,
                icon,
              })

              setEditingMarkerId(null)
              setHasUnsavedMarkerChanges(false)
            }}
            onCancel={() => setEditingMarkerId(null)}
          />
        )}
      </Map>

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
