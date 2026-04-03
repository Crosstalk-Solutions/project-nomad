import { useState, useCallback } from 'react'

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
  id: string
  name: string
  longitude: number
  latitude: number
  color: PinColorId
  createdAt: string
}

const STORAGE_KEY = 'nomad:map-markers'

function getInitialMarkers(): MapMarker[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

function persist(markers: MapMarker[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markers))
  } catch {}
}

export function useMapMarkers() {
  const [markers, setMarkers] = useState<MapMarker[]>(getInitialMarkers)

  const addMarker = useCallback((name: string, longitude: number, latitude: number, color: PinColorId = 'orange'): MapMarker => {
    const marker: MapMarker = {
      id: crypto.randomUUID(),
      name,
      longitude,
      latitude,
      color,
      createdAt: new Date().toISOString(),
    }
    setMarkers((prev) => {
      const next = [...prev, marker]
      persist(next)
      return next
    })
    return marker
  }, [])

  const updateMarker = useCallback((id: string, name: string) => {
    setMarkers((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, name } : m))
      persist(next)
      return next
    })
  }, [])

  const deleteMarker = useCallback((id: string) => {
    setMarkers((prev) => {
      const next = prev.filter((m) => m.id !== id)
      persist(next)
      return next
    })
  }, [])

  return { markers, addMarker, updateMarker, deleteMarker }
}
