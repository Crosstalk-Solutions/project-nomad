import { useCallback, useEffect, useState } from 'react'

import api from '~/lib/api'
import type { MapMarkerResponse } from '../../types/maps'

export const PIN_COLORS = [
  { id: 'orange', label: 'Orange', hex: '#a84a12' },
  { id: 'red', label: 'Red', hex: '#994444' },
  { id: 'green', label: 'Green', hex: '#424420' },
  { id: 'blue', label: 'Blue', hex: '#2563eb' },
  { id: 'purple', label: 'Purple', hex: '#7c3aed' },
  { id: 'yellow', label: 'Yellow', hex: '#ca8a04' },
] as const

export type PinColorId = (typeof PIN_COLORS)[number]['id']

export type MarkerIcon = 'pin' | 'circle' | 'star'

export interface MapMarker {
  id: number
  name: string
  longitude: number
  latitude: number
  color: PinColorId
  customColor?: string | null
  icon?: MarkerIcon | string | null
  iconColor?: string | null
  visible: boolean
  notes?: string | null
  createdAt: string
  updatedAt?: string
}

type CreateMapMarkerValues = {
  name: string
  longitude: number
  latitude: number
  color?: PinColorId
  customColor?: string | null
  icon?: MarkerIcon | string | null
  iconColor?: string | null
  visible?: boolean
  notes?: string | null
}

type UpdateMapMarkerValues = {
  name?: string
  color?: PinColorId
  customColor?: string | null
  icon?: MarkerIcon | string | null
  iconColor?: string | null
  visible?: boolean
  notes?: string | null
}

const mapMarkerResponse = (marker: MapMarkerResponse): MapMarker => ({
  id: marker.id,
  name: marker.name,
  longitude: marker.longitude,
  latitude: marker.latitude,
  color: marker.color as PinColorId,
  customColor: marker.custom_color ?? null,
  icon: marker.icon ?? null,
  iconColor: marker.icon_color ?? null,
  visible: marker.visible ?? true,
  notes: marker.notes ?? null,
  createdAt: marker.created_at,
  updatedAt: marker.updated_at,
})

export function useMapMarkers() {
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.listMapMarkers().then((data) => {
      if (data) {
        setMarkers(data.map(mapMarkerResponse))
      }

      setLoaded(true)
    })
  }, [])

  const addMarker = useCallback(async (values: CreateMapMarkerValues) => {
    const result = await api.createMapMarker({
      name: values.name,
      longitude: values.longitude,
      latitude: values.latitude,
      color: values.color ?? 'orange',
      custom_color: values.customColor ?? null,
      icon: values.icon ?? null,
      icon_color: values.iconColor ?? null,
      visible: values.visible ?? true,
      notes: values.notes ?? null,
    })

    if (result) {
      const marker = mapMarkerResponse(result)
      setMarkers((prev) => [...prev, marker])
      return marker
    }

    return null
  }, [])

  const updateMarker = useCallback(async (id: number, updates: UpdateMapMarkerValues) => {
    const result = await api.updateMapMarker(id, {
      name: updates.name,
      color: updates.color,
      custom_color: updates.customColor,
      icon: updates.icon,
      icon_color: updates.iconColor,
      visible: updates.visible,
      notes: updates.notes,
    })

    if (result) {
      const marker = mapMarkerResponse(result)

      setMarkers((prev) =>
        prev.map((existingMarker) => (existingMarker.id === id ? marker : existingMarker))
      )
    }
  }, [])

  const deleteMarker = useCallback(async (id: number) => {
    await api.deleteMapMarker(id)
    setMarkers((prev) => prev.filter((marker) => marker.id !== id))
  }, [])

  return { markers, loaded, addMarker, updateMarker, deleteMarker }
}
