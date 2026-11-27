import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import type { WorldArchive } from '../../../types/world_offline'
import type { MapLayerMode } from './LayerSelector'
import { TOPOGRAPHIC_PALETTE } from './topographicPalette.js'

type RasterMode = Exclude<MapLayerMode, 'street'>
type Bounds = [west: number, south: number, east: number, north: number]

type OfflineLayer = {
  id: string
  bounds: Bounds
  minZoom: number
  maxZoom: number
  worldCover: boolean
  overview: boolean
  detail?: boolean
}

export type MapCamera = { longitude: number; latitude: number; zoom: number; view?: Bounds }

const normalizeLongitude = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180

function offlineLayerRole(layer: LayerSpecification) {
  if (layer.type !== 'raster' && layer.type !== 'fill') return undefined
  const role = (layer.metadata as Record<string, unknown> | undefined)?.['nomad:role']
  return role === 'aerial' || role === 'topographic' || role === 'blue-marble' ? role : undefined
}

export const localArchiveUrl = (archive: WorldArchive) =>
  `pmtiles://${window.location.origin}/${archive.filename.startsWith('partial-z8-') ? 'local-detail/pmtiles' : 'pmtiles'}/${encodeURIComponent(archive.filename)}` +
  (archive.sha256 ? '?rev=' + encodeURIComponent(archive.sha256) : '')

export function withWorldRaster(style: StyleSpecification, mode: RasterMode, archive: WorldArchive): StyleSpecification {
  const id = `lab-world-${mode}${archive.month ? '-' + archive.month : ''}`
  return {
    ...style,
    sources: {
      ...style.sources,
      [id]: {
        type: 'raster', url: localArchiveUrl(archive), bounds: archive.bounds,
        minzoom: archive.minzoom, maxzoom: archive.maxzoom,
        tileSize: archive.tileSize, attribution: archive.attribution,
      },
    },
    layers: [{ id, type: 'raster', source: id, metadata: { 'nomad:role': mode, 'nomad:world-overview': true } }, ...style.layers],
  }
}

function withHillshadeBand(
  style: StyleSpecification,
  archive: WorldArchive,
  source: string,
  position: number,
  nextZoom?: number,
): StyleSpecification {
  if (archive.format !== 'mvt' || archive.sourceLayer !== 'hillshade-vectors') return style
  const shading: LayerSpecification[] = (['light', 'dark'] as const).map((shade) => ({
    id: source + '-' + shade,
    type: 'fill',
    source,
    'source-layer': 'hillshade-vectors',
    minzoom: archive.minzoom,
    ...(nextZoom === undefined ? {} : { maxzoom: nextZoom }),
    filter: ['==', ['get', 'shade'], shade],
    metadata: { 'nomad:role': 'topographic', 'nomad:world-overview': true },
    paint: {
      'fill-color': shade === 'light' ? TOPOGRAPHIC_PALETTE.highlight : TOPOGRAPHIC_PALETTE.shadow,
      'fill-opacity': shade === 'light' ? TOPOGRAPHIC_PALETTE.highlightOpacity : TOPOGRAPHIC_PALETTE.shadowOpacity,
      'fill-antialias': false,
    },
  }))
  return {
    ...style,
    sources: {
      ...style.sources,
      [source]: {
        type: 'vector', url: localArchiveUrl(archive), bounds: archive.bounds,
        minzoom: archive.minzoom, maxzoom: archive.maxzoom, attribution: archive.attribution,
      },
    },
    layers: [...style.layers.slice(0, position), ...shading, ...style.layers.slice(position)],
  }
}

export function withEarthRelief(style: StyleSpecification, archives: WorldArchive[]): StyleSpecification {
  return archives.reduce((result, archive, index) => withHillshadeBand(
    result, archive, `lab-earth-relief-z${archive.maxzoom}`, index * 2, archives[index + 1]?.minzoom,
  ), style)
}

function withLayers(style: StyleSpecification, layers: LayerSpecification[]): StyleSpecification {
  const visibleSources = new Set(layers.flatMap((layer) => 'source' in layer ? [layer.source] : []))
  if (style.terrain) visibleSources.add(style.terrain.source)
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([key]) => visibleSources.has(key)))
  return { ...style, sources, layers }
}

export function styleWithStreets(style: StyleSpecification): StyleSpecification {
  return withLayers(style, style.layers.filter((layer) => !offlineLayerRole(layer)))
}

export function readOfflineLayers(style: StyleSpecification | null) {
  const result: Record<RasterMode, OfflineLayer[]> = { aerial: [], topographic: [], 'blue-marble': [] }
  if (!style) return result
  for (const layer of style.layers) {
    if (layer.type !== 'raster' && layer.type !== 'fill') continue
    const metadata = layer.metadata as Record<string, unknown> | undefined
    const role = offlineLayerRole(layer)
    if (!role) continue
    const source = style.sources[layer.source]
    if (!source || (source.type !== 'raster' && source.type !== 'vector') || !source.bounds) continue
    const minZoom = source.minzoom ?? 0
    const maxZoom = source.maxzoom ?? 22
    if (!source.bounds.every(Number.isFinite) || minZoom > maxZoom) continue
    result[role].push({ id: layer.id, bounds: source.bounds, minZoom, maxZoom,
      overview: metadata?.['nomad:world-overview'] === true,
      detail: metadata?.['nomad:local-detail'] === true,
      worldCover: typeof metadata?.['nomad:regionId'] === 'string' && /^br(?:-|$)/.test(metadata['nomad:regionId']) })
  }
  return result
}

export function hasCoverage(layer: OfflineLayer, camera: MapCamera) {
  const [west, south, east, north] = layer.bounds
  const lng = normalizeLongitude(camera.longitude)
  const insideLongitude = west <= east ? west <= lng && lng <= east : lng >= west || lng <= east
  const zoom = Math.floor(camera.zoom + 1e-6)
  return insideLongitude && south <= camera.latitude && camera.latitude <= north &&
    layer.minZoom <= zoom && (layer.overview || layer.detail || zoom <= layer.maxZoom)
}

export function inVisibleView(layer: OfflineLayer, camera: MapCamera) {
  if (!camera.view) return hasCoverage(layer, camera)
  const [west, south, east, north] = layer.bounds
  const [viewWest, viewSouth, viewEast, viewNorth] = camera.view
  const zoom = Math.floor(camera.zoom + 1e-6)
  if (zoom < layer.minZoom || (!layer.overview && !layer.detail && zoom > layer.maxZoom) || north < viewSouth || south > viewNorth) return false
  const spans = west <= east ? [[west, east]] : [[west, 180], [-180, east]]
  return spans.some(([start, end]) => [-360, 0, 360].some((offset) =>
    end + offset >= viewWest && start + offset <= viewEast))
}

export function coverageTarget(layers: OfflineLayer[], camera: MapCamera): MapCamera | undefined {
  const candidates = layers.map(({ bounds: [west, south, east, north], minZoom, maxZoom }) => {
    const center = normalizeLongitude((west + (west <= east ? east : east + 360)) / 2)
    const longitude = camera.longitude + normalizeLongitude(center - camera.longitude)
    const latitude = (south + north) / 2
    const zoom = Math.max(minZoom, Math.min(camera.zoom, maxZoom))
    return { longitude, latitude, zoom }
  })
  const distance = (point: MapCamera) =>
    ((point.longitude - camera.longitude) * Math.cos(camera.latitude * Math.PI / 180)) ** 2 +
    (point.latitude - camera.latitude) ** 2
  return candidates.sort((a, b) => distance(a) - distance(b))[0]
}

function topographicRoad(layer: Extract<LayerSpecification, { type: 'line' }>): LayerSpecification {
  // Reuse the basemap's casings, widths, filters, dash patterns and bridge/tunnel order.
  // In particular, retaining its opacity expression preserves subdued rail/tunnel styling.
  const casing = layer.paint?.['line-gap-width'] !== undefined || /(?:^|_)casing(?:_|-)/.test(layer.id)
  return {
    ...layer,
    paint: {
      ...layer.paint,
      'line-color': casing ? TOPOGRAPHIC_PALETTE.halo : [
        'case', ['==', ['get', 'kind'], 'highway'],
        TOPOGRAPHIC_PALETTE.highway, TOPOGRAPHIC_PALETTE.road,
      ],
    },
  }
}

function topographicLabel(layer: Extract<LayerSpecification, { type: 'symbol' }>): LayerSpecification {
  // Sprite-backed route shields use their own background and text palette.
  if (!layer.layout?.['text-field'] || (layer['source-layer'] === 'roads' && layer.layout['icon-image'])) return layer
  return {
    ...layer,
    paint: {
      ...layer.paint,
      'text-color': TOPOGRAPHIC_PALETTE.text,
      'text-halo-color': TOPOGRAPHIC_PALETTE.halo,
      'text-halo-width': layer.paint?.['text-halo-width'] ?? 1.25,
    },
  }
}

export function styleWithOfflineLayer(
  style: StyleSpecification,
  mode: RasterMode,
  layerIds: OfflineLayer[],
  keepStreetLabels = false,
  showStreetOverlay = true,
): StyleSpecification {
  const underlay: LayerSpecification[] = []
  const imagery: LayerSpecification[] = []
  const overlay: LayerSpecification[] = []
  const ids = new Set(layerIds.map(({ id }) => id))
  const earthRelief = mode === 'topographic' && layerIds.some(({ id }) => id.startsWith('lab-earth-relief-'))
  const showVectorLabels = mode !== 'topographic' || keepStreetLabels
  if (earthRelief) {
    underlay.push({ id: 'lab-earth-relief-land', type: 'background', paint: { 'background-color': TOPOGRAPHIC_PALETTE.land } })
    const water = style.layers.find((layer) => layer.id === 'water-world')
    if (water?.type === 'fill') {
      underlay.push({ ...water, id: 'lab-earth-relief-water', paint: { 'fill-color': TOPOGRAPHIC_PALETTE.water } })
    }
  }
  for (const layer of style.layers) {
    if (layer.type === 'raster' || (layer.type === 'fill' && offlineLayerRole(layer))) {
      if (ids.has(layer.id)) imagery.push({ ...layer, layout: { ...layer.layout, visibility: 'visible' } })
      continue
    }
    if (!showStreetOverlay && layer.type !== 'background') continue
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
    if (layer.type === 'line' && sourceLayer === 'roads') {
      if (earthRelief) {
        overlay.push(topographicRoad(layer))
        continue
      }
      const opacity = layer.paint?.['line-opacity'] ?? 1
      overlay.push(typeof opacity === 'number'
        ? { ...layer, paint: { ...layer.paint, 'line-opacity': opacity * 0.65 } }
        : layer)
    } else if (showVectorLabels && layer.type === 'symbol' && (sourceLayer === 'roads' || sourceLayer === 'places')) {
      overlay.push(earthRelief ? topographicLabel(layer) : layer)
    } else if (!earthRelief) {
      // Base features remain visible through transparent areas. USGSTopo has its own labels.
      underlay.push(layer)
    }
  }
  if (!showStreetOverlay && underlay.length === 0) {
    underlay.push({ id: 'background', type: 'background', paint: { 'background-color': '#cccccc' } })
  }
  const result = { ...style }
  if (!showStreetOverlay) {
    delete result.sprite
    delete result.glyphs
    delete result.terrain
  }
  return withLayers(result, [...underlay, ...imagery, ...overlay])
}
