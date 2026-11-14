// eslint-disable-next-line @unicorn/filename-case
import { useCallback, useEffect, useState } from 'react'

import api from '~/lib/api'
import type { MarkerLayerResponse } from '../../types/maps'

// Map pin layers (#1387). Not MapLibre style layers.
export interface MarkerLayer {
  id: number
  name: string
  visible: boolean
  markerCount: number
}

const SELECTED_LAYER_KEY = 'nomad:map-selected-layer'

const toMarkerLayer = (layer: MarkerLayerResponse): MarkerLayer => ({
  id: layer.id,
  name: layer.name,
  visible: Boolean(layer.visible),
  markerCount: layer.marker_count ?? 0,
})

const readSelectedLayer = (): number | null => {
  const stored = Number(localStorage.getItem(SELECTED_LAYER_KEY))
  return Number.isInteger(stored) && stored > 0 ? stored : null
}

export function useMarkerLayers() {
  const [layers, setLayers] = useState<MarkerLayer[]>([])
  const [selectedLayerId, setSelectedLayerIdState] = useState<number | null>(readSelectedLayer)

  const setSelectedLayerId = useCallback((id: number) => {
    setSelectedLayerIdState(id)
    try {
      localStorage.setItem(SELECTED_LAYER_KEY, String(id))
    } catch {
      // ignore persistence failures (private mode, quota)
    }
  }, [])

  const reload = useCallback(async () => {
    const data = await api.listMarkerLayers()
    if (data) setLayers(data.map(toMarkerLayer))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // New pins go into the selected layer. Fall back to the first layer when the
  // saved one no longer exists (deleted here, or on another device).
  const activeLayerId =
    layers.find((layer) => layer.id === selectedLayerId)?.id ?? layers[0]?.id ?? null

  const createLayer = useCallback(
    async (name: string) => {
      const created = await api.createMarkerLayer(name)
      if (created) {
        setLayers((prev) => [...prev, toMarkerLayer(created)])
        setSelectedLayerId(created.id)
      }
      return created ?? null
    },
    [setSelectedLayerId]
  )

  const renameLayer = useCallback(async (id: number, name: string) => {
    const updated = await api.updateMarkerLayer(id, { name })
    if (updated) {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name: updated.name } : l)))
    }
    return updated ?? null
  }, [])

  const setLayerVisible = useCallback(async (id: number, visible: boolean) => {
    // Optimistic, so the checkbox and the map respond immediately.
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible } : l)))
    const updated = await api.updateMarkerLayer(id, { visible })
    if (!updated) {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !visible } : l)))
    }
  }, [])

  const deleteLayer = useCallback(async (id: number) => {
    const result = await api.deleteMarkerLayer(id)
    if (result.ok) setLayers((prev) => prev.filter((l) => l.id !== id))
    return result
  }, [])

  // Keep pin counts current without re-fetching after every pin change.
  const adjustCount = useCallback((id: number, delta: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, markerCount: Math.max(0, l.markerCount + delta) } : l))
    )
  }, [])

  return {
    layers,
    activeLayerId,
    setSelectedLayerId,
    reload,
    createLayer,
    renameLayer,
    setLayerVisible,
    deleteLayer,
    adjustCount,
  }
}
