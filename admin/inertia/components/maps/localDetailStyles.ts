import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import type { LocalDetailCell } from '../../../types/local_detail.js'
import { localArchiveUrl, type MapCamera } from './mapLayerStyles.js'
import { TOPOGRAPHIC_PALETTE } from './topographicPalette.js'

/** Regional sources start at the fixed selection grid; the existing world remains their overview. */
export function withLocalDetail(style: StyleSpecification, cells: LocalDetailCell[]): StyleSpecification {
  if (!cells.length) return style
  const templates = style.layers.filter((layer): layer is LayerSpecification & { source: string; 'source-layer': string } =>
    'source-layer' in layer && 'source' in layer && typeof layer.source === 'string' && layer.type !== 'raster')
  const vectorId = templates.find((layer) => layer.source === 'world')?.source
    ?? templates.find((layer) => layer['source-layer'] === 'roads')?.source
  const streets = templates.filter((layer) => 'source' in layer && layer.source === vectorId)
  const sources = { ...style.sources }, layers: LayerSpecification[] = [...style.layers]
  for (const cell of cells) {
    const prefix = `local-detail-${cell.x}-${cell.y}`
    const street = cell.archives.find((archive) => archive.role === 'street')
    if (street) {
      sources[prefix + '-street'] = {
        type: 'vector', url: localArchiveUrl(street), bounds: cell.bounds,
        minzoom: 8, maxzoom: street.maxzoom, attribution: street.attribution,
      }
      for (const layer of streets) layers.push({ ...layer, id: layer.id + '-' + prefix,
        source: prefix + '-street', minzoom: Math.max(8, layer.minzoom ?? 0) } as LayerSpecification)
    }
    for (const archive of cell.archives) {
      const source = prefix + '-' + archive.role
      if (archive.role === 'satellite') {
        sources[source] = { type: 'raster', url: localArchiveUrl(archive), bounds: cell.bounds,
          minzoom: 8, maxzoom: archive.maxzoom, tileSize: archive.tileSize, attribution: archive.attribution }
        layers.push({ id: source, type: 'raster', source, minzoom: 8,
          metadata: { 'nomad:role': 'aerial', 'nomad:local-detail': true } })
      }
      if (archive.role === 'topography') {
        sources[source] = { type: 'vector', url: localArchiveUrl(archive), bounds: cell.bounds,
          minzoom: 8, maxzoom: archive.maxzoom, attribution: archive.attribution }
        // Land and water from this square mask the coarser world shading before its native relief.
        if (street) for (const [sourceLayer, color] of [['earth', TOPOGRAPHIC_PALETTE.land], ['water', TOPOGRAPHIC_PALETTE.water]]) {
          layers.push({ id: `lab-earth-relief-${prefix}-${sourceLayer}`, type: 'fill', source: prefix + '-street',
            'source-layer': sourceLayer, minzoom: 8, paint: { 'fill-color': color, 'fill-antialias': false },
            filter: ['==', ['geometry-type'], 'Polygon'],
            metadata: { 'nomad:role': 'topographic', 'nomad:local-detail': true } })
        }
        for (const shade of ['light', 'dark'] as const) layers.push({
          id: `lab-earth-relief-${prefix}-${shade}`, type: 'fill', source, minzoom: 8,
          'source-layer': archive.sourceLayer ?? 'hillshade-vectors', filter: ['==', ['get', 'shade'], shade],
          metadata: { 'nomad:role': 'topographic', 'nomad:local-detail': true },
          paint: { 'fill-color': shade === 'light' ? TOPOGRAPHIC_PALETTE.highlight : TOPOGRAPHIC_PALETTE.shadow,
            'fill-opacity': shade === 'light' ? TOPOGRAPHIC_PALETTE.highlightOpacity : TOPOGRAPHIC_PALETTE.shadowOpacity,
            'fill-antialias': false },
        })
      }
    }
  }
  return { ...style, sources, layers }
}

export function localDetailInView(cells: LocalDetailCell[], camera: MapCamera) {
  if (camera.zoom < 8) return []
  const view = camera.view ?? [camera.longitude, camera.latitude, camera.longitude, camera.latitude]
  const marginX = Math.max(0, view[2] - view[0]) * .15, marginY = Math.max(0, view[3] - view[1]) * .15
  return cells.filter(({ bounds: [west, south, east, north] }) =>
    north >= view[1] - marginY && south <= view[3] + marginY && [-360, 0, 360].some((offset) =>
      east + offset >= view[0] - marginX && west + offset <= view[2] + marginX))
}
