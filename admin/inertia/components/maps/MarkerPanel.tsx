import { useMemo, useState } from 'react'
import {
  IconEye,
  IconEyeOff,
  IconMapPin,
  IconMapPinFilled,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import * as TablerIcons from '@tabler/icons-react'
import type { IconProps } from '@tabler/icons-react'
import type { ComponentType } from 'react'
import { PIN_COLORS } from '~/hooks/useMapMarkers'
import type { MapMarker } from '~/hooks/useMapMarkers'

interface MarkerPanelProps {
  markers: MapMarker[]
  onDelete: (id: number) => void
  onFlyTo: (longitude: number, latitude: number) => void
  onSelect: (id: number | null) => void
  onToggleVisibility: (id: number, visible: boolean) => void
  selectedMarkerId: number | null
}

type SortField = 'name' | 'color' | 'visibility' | 'icon'
type SortDirection = 'asc' | 'desc'

const normalizeColorHex = (color: string, customColor?: string | null) => {
  if (customColor) return customColor

  const preset = PIN_COLORS.find((pinColor) => pinColor.id === color)
  return preset?.hex ?? color
}

const getColorSortValue = (color: string, customColor?: string | null) => {
  const hex = normalizeColorHex(color, customColor).replace('#', '')

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { bucket: 2, hue: 0, lightness: 0 }
  }

  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return { bucket: 0, hue: 0, lightness }
  }

  let hue = 0

  if (max === r) {
    hue = ((g - b) / delta) % 6
  } else if (max === g) {
    hue = (b - r) / delta + 2
  } else {
    hue = (r - g) / delta + 4
  }

  return {
    bucket: 1,
    hue: Math.round(hue * 60 + 360) % 360,
    lightness,
  }
}

const resolveMarkerIcon = (icon?: string | null): ComponentType<IconProps> => {
  if (!icon) return IconMapPinFilled

  const Icon = (TablerIcons as Record<string, unknown>)[icon]

  return Icon ? (Icon as ComponentType<IconProps>) : IconMapPinFilled
}

export default function MarkerPanel({
                                      markers,
                                      onDelete,
                                      onFlyTo,
                                      onSelect,
                                      onToggleVisibility,
                                      selectedMarkerId,
                                    }: MarkerPanelProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sortDirectionLabel =
    sortField === 'name'
      ? sortDirection === 'asc'
        ? 'A → Z'
        : 'Z → A'
      : sortField === 'color'
        ? sortDirection === 'asc'
          ? 'Hue ↑'
          : 'Hue ↓'
        : sortField === 'icon'
          ? sortDirection === 'asc'
            ? 'A → Z'
            : 'Z → A'
          : sortDirection === 'asc'
            ? 'Hidden first'
            : 'Visible first'

  const visibleMarkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return [...markers]
      .filter((marker) => {
        if (!query) return true
        return marker.name.toLowerCase().includes(query)
      })
      .sort((a, b) => {
        const result =
          sortField === 'name'
            ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

            : sortField === 'visibility'
              ? Number(a.visible) - Number(b.visible)

              : sortField === 'icon'
                ? (a.icon ? 1 : 0) - (b.icon ? 1 : 0) ||
                (a.icon ?? '').localeCompare(b.icon ?? '')

                : (() => {
                  const aColor = getColorSortValue(a.color, a.customColor)
                  const bColor = getColorSortValue(b.color, b.customColor)

                  return (
                    aColor.bucket - bColor.bucket ||
                    aColor.hue - bColor.hue ||
                    aColor.lightness - bColor.lightness
                  )
                })()

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
            <option value="color">Sort by hue</option>
            <option value="icon">Sort by icon</option>
            <option value="visibility">Sort by visibility</option>
          </select>

          <button
            type="button"
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="rounded border border-border-default px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            {sortDirectionLabel}
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
            {visibleMarkers.map((marker) => {
              const MarkerIcon = resolveMarkerIcon(marker.icon)

              return (
                <li
                  key={marker.id}
                  className={`group flex items-center gap-2 border-b border-border-subtle px-3 py-2 transition-colors last:border-b-0 ${
                    marker.id === selectedMarkerId ? 'bg-desert-green/10' : 'hover:bg-surface-secondary'
                  } ${marker.visible ? '' : 'opacity-60'}`}
                >
                  <MarkerIcon
                    size={16}
                    className="shrink-0"
                    style={{
                      color: normalizeColorHex(marker.color, marker.customColor),
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
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleVisibility(marker.id, !marker.visible)
                    }}
                    className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
                    title={marker.visible ? 'Hide pin' : 'Show pin'}
                    aria-label={marker.visible ? 'Hide pin' : 'Show pin'}
                  >
                    {marker.visible ? <IconEye size={14}/> : <IconEyeOff size={14}/>}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(marker.id)}
                    className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:bg-surface-secondary hover:text-desert-red group-hover:opacity-100"
                    title="Delete pin"
                  >
                    <IconTrash size={14}/>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
