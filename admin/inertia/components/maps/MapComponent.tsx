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
import ViewMapMarkerPopup from './ViewMapMarkerPopup'
import MapMarkerFormPopup from './MapMarkerFormPopup'
import ScaleUnitControl from './ScaleUnitControl'

type ScaleUnit = 'imperial' | 'metric'

export default function MapComponent() {
  const mapRef = useRef<MapRef>(null)
  const { markers, addMarker, updateMarker, deleteMarker } = useMapMarkers()

  const [placingMarker, setPlacingMarker] = useState<{ lng: number; lat: number } | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null)

  const [scaleUnit, setScaleUnit] = useState<ScaleUnit>(
    () => (localStorage.getItem('nomad:map-scale-unit') as ScaleUnit) || 'metric'
  )

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

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    setPlacingMarker({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    setSelectedMarkerId(null)
    setEditingMarkerId(null)
  }, [])

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
        <ScaleUnitControl scaleUnit={scaleUnit} onChange={handleScaleUnitChange} />

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
              setEditingMarkerId(null)
            }}
          >
            <MarkerPin
              color={PIN_COLORS.find((color) => color.id === marker.color)?.hex}
              active={marker.id === selectedMarkerId}
            />
          </Marker>
        ))}

        {placingMarker && (
          <MapMarkerFormPopup
            longitude={placingMarker.lng}
            latitude={placingMarker.lat}
            onSave={async ({ name, notes, color }) => {
              await addMarker(name, placingMarker.lng, placingMarker.lat, color, notes || undefined)
              setPlacingMarker(null)
            }}
            onCancel={() => setPlacingMarker(null)}
          />
        )}

        {selectedMarker && editingMarkerId !== selectedMarker.id && (
          <ViewMapMarkerPopup
            marker={selectedMarker}
            onClose={() => setSelectedMarkerId(null)}
            onEdit={() => setEditingMarkerId(selectedMarker.id)}
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
            onSave={async ({ id, name, notes, color }) => {
              if (!id) return

              await updateMarker(id, {
                name,
                notes: notes || null,
                color,
              })

              setEditingMarkerId(null)
            }}
            onCancel={() => setEditingMarkerId(null)}
          />
        )}
      </Map>

      <MarkerPanel
        markers={markers}
        onDelete={handleDeleteMarker}
        onFlyTo={handleFlyTo}
        onSelect={setSelectedMarkerId}
        selectedMarkerId={selectedMarkerId}
      />
    </MapProvider>
  )
}
