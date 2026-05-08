import { useState, useCallback, useEffect } from 'react'
import api from '../lib/api.js'

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
  notes: string | null
  createdAt: string
}

export interface MapMarkerApiRecord {
  id: number
  name: string
  longitude: number
  latitude: number
  color: string
  notes?: string | null
  created_at: string
}

export function normalizeMapMarker(record: MapMarkerApiRecord): MapMarker {
  return {
    id: record.id,
    name: record.name,
    longitude: record.longitude,
    latitude: record.latitude,
    color: record.color as PinColorId,
    notes: record.notes ?? null,
    createdAt: record.created_at,
  }
}

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
