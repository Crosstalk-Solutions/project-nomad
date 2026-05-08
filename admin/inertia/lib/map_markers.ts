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
