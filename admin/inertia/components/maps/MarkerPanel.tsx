import { useMemo, useState } from 'react'
import { IconMapPinFilled, IconTrash, IconMapPin, IconX } from '@tabler/icons-react'

import { PIN_COLORS } from '~/hooks/useMapMarkers'
import type { MapMarker } from '~/hooks/useMapMarkers'

interface MarkerPanelProps {
  markers: MapMarker[]
  onDelete: (id: number) => void
  onFlyTo: (longitude: number, latitude: number) => void
  onSelect: (id: number | null) => void
  selectedMarkerId: number | null
}

const getColorSortValue = (color: string) => {
  const preset = PIN_COLORS.find((pinColor) => pinColor.id === color)

  if (preset) return preset.label

  return color.replace('#', '').toLowerCase()
}

type SortField = 'name' | 'color'
type SortDirection = 'asc' | 'desc'

export default function MarkerPanel({
                                      markers,
                                      onDelete,
                                      onFlyTo,
                                      onSelect,
                                      selectedMarkerId,
                                    }: MarkerPanelProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const visibleMarkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return [...markers]
      .filter((marker) => {
        if (!query) return true
        return marker.name.toLowerCase().includes(query)
      })
      .sort((a, b) => {
        const aValue = sortField === 'name' ? a.name : getColorSortValue(a.color)
        const bValue = sortField === 'name' ? b.name : getColorSortValue(b.color)

        const result = aValue.localeCompare(bValue, undefined, {
          sensitivity: 'base',
        })

        return sortDirection === 'asc' ? result : -result
      })
  }, [markers, searchQuery, sortField, sortDirection])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-4 top-[72px] z-40 flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-primary/95 px-3 py-2 shadow-lg backdrop-blur-sm transition-colors hover:bg-surface-secondary"
        title="Show saved locations"
      >
        <IconMapPin size={18} className="text-desert-orange" />
        <span className="text-sm font-medium text-text-primary">Pins</span>

        {markers.length > 0 && (
          <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-desert-orange px-1 text-[11px] font-bold text-white">
            {markers.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="absolute left-4 top-[72px] z-40 w-72 rounded-lg border border-border-subtle bg-surface-primary/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
        <div className="flex items-center gap-2">
          <IconMapPin size={18} className="text-desert-orange" />

          <span className="text-sm font-semibold text-text-primary">Saved Locations</span>

          {markers.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-desert-orange px-1 text-[11px] font-bold text-white">
              {markers.length}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
          title="Close panel"
        >
          <IconX size={16} />
        </button>
      </div>

      <div className="space-y-2 border-b border-border-subtle px-3 py-2">
        <input
          type="search"
          placeholder="Search pins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full rounded border border-border-default bg-surface-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:border-desert-green focus:outline-none"
        />

        <div className="flex gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="flex-1 rounded border border-border-default bg-surface-primary px-2 py-1 text-xs text-text-primary focus:border-desert-green focus:outline-none"
          >
            <option value="name">Sort by name</option>
            <option value="color">Sort by color</option>
          </select>

          <button
            type="button"
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="rounded border border-border-default px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            {sortDirection === 'asc' ? 'A → Z' : 'Z → A'}
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
        {markers.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <IconMapPinFilled size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-muted">Click anywhere on the map to drop a pin</p>
          </div>
        ) : visibleMarkers.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-text-muted">No pins match your search.</p>
          </div>
        ) : (
          <ul>
            {visibleMarkers.map((marker) => (
              <li
                key={marker.id}
                className={`group flex items-center gap-2 border-b border-border-subtle px-3 py-2 transition-colors last:border-b-0 ${
                  marker.id === selectedMarkerId
                    ? 'bg-desert-green/10'
                    : 'hover:bg-surface-secondary'
                }`}
              >
                <IconMapPinFilled
                  size={16}
                  className="shrink-0"
                  style={{
                    color: PIN_COLORS.find((color) => color.id === marker.color)?.hex ?? '#a84a12',
                  }}
                />

                <button
                  type="button"
                  onClick={() => {
                    onSelect(marker.id)
                    onFlyTo(marker.longitude, marker.latitude)
                  }}
                  className="min-w-0 flex-1 text-left"
                  title={marker.name}
                >
                  <p className="truncate text-sm font-medium text-text-primary">{marker.name}</p>
                </button>

                <button
                  type="button"
                  onClick={() => onDelete(marker.id)}
                  className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:bg-surface-secondary hover:text-desert-red group-hover:opacity-100"
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
