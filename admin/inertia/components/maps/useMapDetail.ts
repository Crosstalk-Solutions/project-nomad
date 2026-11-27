import type { StyleSpecification } from 'maplibre-gl'
import type { Header } from 'pmtiles'
import { useEffect, useMemo, useRef, useState } from 'react'
import { describeMapDetail, type DetailDemSource } from './mapDetailModel'
import type { MapCamera } from './mapLayerStyles'
import type { MapLayerMode } from './LayerSelector'
import { MapDetailHeaderCache } from './mapDetailHeaders'

type SourceHeader = { url: string; header: Header }

/** Read only missing native metadata from the same local archives the map uses. */
export function useAvailableMapDetail(
  enabled: boolean, style: StyleSpecification | null, camera: MapCamera, mode: MapLayerMode,
  demSources: DetailDemSource[], checking: boolean, retryGeneration = 0,
) {
  const cache = useRef(new MapDetailHeaderCache())
  const previousRetry = useRef(retryGeneration)
  const [headers, setHeaders] = useState<Record<string, SourceHeader>>({})
  const [loading, setLoading] = useState(false)
  const missing = useMemo(() => !enabled || !style ? [] : Object.entries(style.sources).flatMap(([id, source]) => {
    if ((source.type !== 'raster' && source.type !== 'vector') || !source.url?.startsWith('pmtiles://')) return []
    if (Number.isFinite(source.maxzoom) && Array.isArray(source.bounds)) return []
    const url = source.url.slice('pmtiles://'.length)
    try {
      const parsed = new URL(url)
      if (parsed.origin !== window.location.origin || !/^\/(?:pmtiles|local-detail\/pmtiles)\//.test(parsed.pathname)) return []
    } catch { return [] }
    return [{ id, url }]
  }), [enabled, style])
  const key = missing.map(({ id, url }) => id + ':' + url).sort().join('|')

  useEffect(() => {
    if (previousRetry.current !== retryGeneration) {
      cache.current.clear()
      previousRetry.current = retryGeneration
    }
    if (!enabled || !missing.length) { setLoading(false); return }
    let closed = false
    setLoading(true)
    void Promise.all(missing.map(async ({ id, url }) => {
      // Recover a brief local-server interruption without a page reload or an
      // external lookup. Existing map Retry also starts a fresh bounded attempt.
      for (const delay of [0, 400, 1200]) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay))
        if (closed) return null
        try { return { id, value: { url, header: await cache.current.get(url) } } }
        catch { /* A failed or timed-out request is evicted before the next attempt. */ }
      }
      return null
    })).then((values) => {
      if (closed) return
      setHeaders(Object.fromEntries(values.filter((value) => value !== null).map(({ id, value }) => [id, value])))
      setLoading(false)
    })
    return () => { closed = true; cache.current.cancelPending() }
  }, [enabled, key, retryGeneration])

  const available = useMemo(() => {
    if (!style) return null
    const sources = { ...style.sources }
    for (const [id, value] of Object.entries(headers)) {
      const source = sources[id]
      if (!source || (source.type !== 'raster' && source.type !== 'vector')
          || source.url?.slice('pmtiles://'.length) !== value.url) continue
      const { header } = value
      sources[id] = { ...source, maxzoom: source.maxzoom ?? header.maxZoom, minzoom: source.minzoom ?? header.minZoom,
        bounds: source.bounds ?? [header.minLon, header.minLat, header.maxLon, header.maxLat] }
    }
    // Foundation raster layers are initially hidden for Street; their availability
    // still belongs to the selected mode, including higher progressive relief bands.
    const role = mode === 'aerial' ? 'aerial' : mode === 'topographic' ? 'topographic' : mode === 'blue-marble' ? 'blue-marble' : undefined
    const layers = style.layers.map((layer) => role && (layer.metadata as Record<string, unknown> | undefined)?.['nomad:role'] === role
      ? { ...layer, layout: { ...layer.layout, visibility: 'visible' as const } } : layer)
    return { ...style, sources, layers } as StyleSpecification
  }, [style, headers, mode])

  return useMemo(() => {
    const detail = describeMapDetail({ style: enabled ? available : null, camera, mode, demSources,
      checking: enabled && checking })
    return loading && detail.availability === 'unknown' ? { ...detail, availability: 'checking' as const } : detail
  }, [enabled, available, camera, mode, demSources, checking, loading])
}
