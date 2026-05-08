import { useState, useCallback, useEffect } from 'react'
import api from '../lib/api.js'
import { normalizeMapMarker, PIN_COLORS } from '../lib/map_markers.js'
import type { MapMarker, MapMarkerApiRecord, PinColorId } from '../lib/map_markers.js'

export { PIN_COLORS }
export type { MapMarker, MapMarkerApiRecord, PinColorId }

export function useMapMarkers() {
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [loaded, setLoaded] = useState(false)

  // Load markers from API on mount
  useEffect(() => {
    api.listMapMarkers().then((data: MapMarkerApiRecord[] | undefined) => {
      if (data) {
        setMarkers(data.map(normalizeMapMarker))
      }
      setLoaded(true)
    })
  }, [])

  const addMarker = useCallback(
    async (name: string, longitude: number, latitude: number, color: PinColorId = 'orange') => {
      const result = await api.createMapMarker({ name, longitude, latitude, color })
      if (result) {
        const marker = normalizeMapMarker(result)
        setMarkers((prev) => [...prev, marker])
        return marker
      }
      return null
    },
    []
  )

  const updateMarker = useCallback(async (id: number, updates: { name?: string; color?: string }) => {
    const result = await api.updateMapMarker(id, updates)
    if (result) {
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, name: result.name, color: result.color as PinColorId }
            : m
        )
      )
    }
  }, [])

  const deleteMarker = useCallback(async (id: number) => {
    await api.deleteMapMarker(id)
    setMarkers((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { markers, loaded, addMarker, updateMarker, deleteMarker }
}
