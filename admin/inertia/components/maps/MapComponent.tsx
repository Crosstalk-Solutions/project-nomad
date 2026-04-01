import Map, {
  FullscreenControl,
  GeolocateControl,
  NavigationControl,
  MapProvider,
  Marker,
  useMap,
} from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { useCallback, useEffect, useRef, useState } from 'react'
import MapSearchControl from './MapSearchControl'

interface SearchResult {
  name: string
  kind: string
  sourceLayer: string
  coordinates: [number, number]
}

export default function MapComponent() {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

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
        id="nomad-map"
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
      >
        <NavigationControl style={{ marginTop: '110px', marginRight: '36px' }} />
        <FullscreenControl style={{ marginTop: '30px', marginRight: '36px' }} />
        <GeolocateControl
          positionOptions={{ enableHighAccuracy: true }}
          trackUserLocation
          showUserHeading
          style={{ marginTop: '190px', marginRight: '36px' }}
        />
        {selectedResult && (
          <Marker
            longitude={selectedResult.coordinates[0]}
            latitude={selectedResult.coordinates[1]}
            color="#ef4444"
          />
        )}
        <MapSearchInner
          onResults={setSearchResults}
          searchResults={searchResults}
          onSelect={setSelectedResult}
        />
      </Map>
    </MapProvider>
  )
}

function MapSearchInner({
  onResults,
  searchResults,
  onSelect,
}: {
  onResults: (results: SearchResult[]) => void
  searchResults: SearchResult[]
  onSelect: (result: SearchResult | null) => void
}) {
  const { 'nomad-map': map } = useMap()

  const handleSearch = useCallback(
    (query: string) => {
      if (!map || !query.trim()) {
        onResults([])
        return
      }

      const mapInstance = map.getMap()
      const results: SearchResult[] = []
      const seen = new Set<string>()
      const lowerQuery = query.toLowerCase()

      // First: query rendered features (what's visible on screen)
      const renderedFeatures = mapInstance.queryRenderedFeatures()
      for (const feature of renderedFeatures) {
        const name = feature.properties?.name || feature.properties?.['pgf:name']
        if (!name) continue
        if (!name.toLowerCase().includes(lowerQuery)) continue

        const sl = feature.sourceLayer || ''
        const key = `${name}-${sl}-${feature.properties?.kind}`
        if (seen.has(key)) continue
        seen.add(key)

        let coords: [number, number] | null = null
        if (feature.geometry.type === 'Point') {
          coords = feature.geometry.coordinates as [number, number]
        } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          const bounds = new maplibregl.LngLatBounds()
          const flatCoords =
            feature.geometry.type === 'Polygon'
              ? feature.geometry.coordinates[0]
              : feature.geometry.coordinates[0][0]
          for (const coord of flatCoords) {
            bounds.extend(coord as [number, number])
          }
          const center = bounds.getCenter()
          coords = [center.lng, center.lat]
        }

        if (coords) {
          results.push({
            name,
            kind: feature.properties?.kind || sl || 'place',
            sourceLayer: sl,
            coordinates: coords,
          })
        }
      }

      // Second: also query source features from all loaded tiles
      const sourceIds = Object.keys(mapInstance.getStyle().sources)
      for (const sourceId of sourceIds) {
        for (const sourceLayer of ['places', 'pois']) {
          let features
          try {
            features = mapInstance.querySourceFeatures(sourceId, { sourceLayer })
          } catch {
            continue
          }

          for (const feature of features) {
            const name = feature.properties?.name || feature.properties?.['pgf:name']
            if (!name) continue
            if (!name.toLowerCase().includes(lowerQuery)) continue

            const key = `${name}-${sourceLayer}-${feature.properties?.kind}`
            if (seen.has(key)) continue
            seen.add(key)

            let coords: [number, number] | null = null
            if (feature.geometry.type === 'Point') {
              coords = feature.geometry.coordinates as [number, number]
            } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
              const bounds = new maplibregl.LngLatBounds()
              const flatCoords =
                feature.geometry.type === 'Polygon'
                  ? feature.geometry.coordinates[0]
                  : feature.geometry.coordinates[0][0]
              for (const coord of flatCoords) {
                bounds.extend(coord as [number, number])
              }
              const center = bounds.getCenter()
              coords = [center.lng, center.lat]
            }

            if (coords) {
              results.push({
                name,
                kind: feature.properties?.kind || sourceLayer,
                sourceLayer,
                coordinates: coords,
              })
            }
          }
        }
      }

      results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === query.toLowerCase()
        const bExact = b.name.toLowerCase() === query.toLowerCase()
        if (aExact && !bExact) return -1
        if (!aExact && bExact) return 1
        return a.name.localeCompare(b.name)
      })

      onResults(results.slice(0, 50))
    },
    [map, onResults]
  )

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onSelect(result)
      if (map) {
        map.flyTo({
          center: result.coordinates,
          zoom: result.kind === 'city' || result.kind === 'state' ? 10 : 14,
          duration: 1500,
        })
      }
    },
    [map, onSelect]
  )

  return (
    <MapSearchControl
      onSearch={handleSearch}
      results={searchResults}
      onSelect={handleSelect}
      onClear={() => {
        onResults([])
        onSelect(null)
      }}
    />
  )
}
