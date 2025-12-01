import Map, { FullscreenControl, NavigationControl, MapProvider } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { useEffect } from 'react'
import { useWindowSize } from 'usehooks-ts'

export default function MapComponent() {
  const { width = 0, height = 0 } = useWindowSize()

  // Add the PMTiles protocol to maplibre-gl
  useEffect(() => {
    let protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  return (
    <MapProvider>
      <Map
        reuseMaps
        style={{
          width: width,
          height: height - 175,
          borderRadius: '5px',
          boxShadow: '0 0 4px rgba(0,0,0,0.3)',
          backgroundColor: '#fff',
        }}
        mapStyle={`http://${window.location.hostname}:${window.location.port}/api/maps/styles`}
        mapLib={maplibregl}
        initialViewState={{
          longitude: -101,
          latitude: 40,
          zoom: 3.5,
        }}
      >
        <NavigationControl />
        <FullscreenControl />
      </Map>
    </MapProvider>
  )
}
