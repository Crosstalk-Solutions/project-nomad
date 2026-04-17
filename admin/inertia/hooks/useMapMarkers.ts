import { useState, useCallback, useEffect } from 'react'
import api from '~/lib/api'

export const PIN_COLORS = [
  { id: 'orange', label: 'Orange', hex: '#a84a12' },
  { id: 'red', label: 'Red', hex: '#994444' },
  { id: 'green', label: 'Green', hex: '#424420' },
  { id: 'blue', label: 'Blue', hex: '#2563eb' },
  { id: 'purple', label: 'Purple', hex: '#7c3aed' },
  { id: 'yellow', label: 'Yellow', hex: '#ca8a04' },
] as const

export type PinColorId = typeof PIN_COLORS[number]['id']

export interface MapMarker {
  id: number
  name: string
  longitude: number
  latitude: number
  color: PinColorId
  createdAt: string
}

export function useMapMarkers() {
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [loaded, setLoaded] = useState(false)

  // Load markers from API on mount
  useEffect(() => {
    api.listMapMarkers().then((data) => {
      if (data) {
        setMarkers(
          data.map((m) => ({
            id: m.id,
            name: m.name,
            longitude: m.longitude,
            latitude: m.latitude,
            color: m.color as PinColorId,
            createdAt: m.created_at,
          }))
        )
      }
      setLoaded(true)
    })
  }, [])

  const addMarker = useCallback(
    async (name: string, longitude: number, latitude: number, color: PinColorId = 'orange') => {
      const result = await api.createMapMarker({ name, longitude, latitude, color })
      if (result) {
        const marker: MapMarker = {
          id: result.id,
          name: result.name,
          longitude: result.longitude,
          latitude: result.latitude,
          color: result.color as PinColorId,
          createdAt: result.created_at,
        }
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
