import { useState } from 'react'
import { IconMapPinFilled, IconTrash, IconMapPin, IconX } from '@tabler/icons-react'
import { PIN_COLORS } from '~/hooks/useMapMarkers'
import type { MapMarker } from '~/hooks/useMapMarkers'

interface MarkerPanelProps {
  markers: MapMarker[]
  onDelete: (id: string) => void
  onFlyTo: (longitude: number, latitude: number) => void
  onSelect: (id: string | null) => void
  selectedMarkerId: string | null
}

export default function MarkerPanel({
  markers,
  onDelete,
  onFlyTo,
  onSelect,
  selectedMarkerId,
}: MarkerPanelProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-4 top-[72px] z-40 flex items-center gap-1.5 rounded-lg bg-surface-primary/95 px-3 py-2 shadow-lg border border-border-subtle backdrop-blur-sm hover:bg-surface-secondary transition-colors"
        title="Show saved locations"
      >
        <IconMapPin size={18} className="text-desert-orange" />
        <span className="text-sm font-medium text-text-primary">Pins</span>
        {markers.length > 0 && (
          <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-desert-orange text-[11px] font-bold text-white px-1">
            {markers.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="absolute left-4 top-[72px] z-40 w-72 rounded-lg bg-surface-primary/95 shadow-lg border border-border-subtle backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <IconMapPin size={18} className="text-desert-orange" />
          <span className="text-sm font-semibold text-text-primary">
            Saved Locations
          </span>
          {markers.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-desert-orange text-[11px] font-bold text-white px-1">
              {markers.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors"
          title="Close panel"
        >
          <IconX size={16} />
        </button>
      </div>

      {/* Marker list */}
      <div className="max-h-[calc(100vh-180px)] overflow-y-auto">
        {markers.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <IconMapPinFilled size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-muted">
              Click anywhere on the map to drop a pin
            </p>
          </div>
        ) : (
          <ul>
            {markers.map((marker) => (
              <li
                key={marker.id}
                className={`flex items-center gap-2 px-3 py-2 border-b border-border-subtle last:border-b-0 group transition-colors ${
                  marker.id === selectedMarkerId
                    ? 'bg-desert-green/10'
                    : 'hover:bg-surface-secondary'
                }`}
              >
                <IconMapPinFilled
                  size={16}
                  className="shrink-0"
                  style={{ color: PIN_COLORS.find((c) => c.id === marker.color)?.hex ?? '#a84a12' }}
                />
                <button
                  onClick={() => {
                    onSelect(marker.id)
                    onFlyTo(marker.longitude, marker.latitude)
                  }}
                  className="flex-1 min-w-0 text-left"
                  title={marker.name}
                >
                  <p className="text-sm font-medium text-text-primary truncate">
                    {marker.name}
                  </p>
                </button>
                <button
                  onClick={() => onDelete(marker.id)}
                  className="shrink-0 rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-desert-red hover:bg-surface-secondary transition-all"
                  title="Delete pin"
                >
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
