import { resolveMarkerIcon } from './marker_icons'
import { useMemo, useState } from 'react'
import {
  IconEye,
  IconEyeOff,
  IconList,
  IconMapPin,
  IconMapPinFilled,
  IconSitemap,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
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

type ColorSortValue = {
  bucket: number
  hue: number
  lightness: number
}

type MarkerGroup = {
  key: string
  label: string
  markers: MapMarker[]
}

const normalizeColorHex = (color: string, customColor?: string | null) => {
  if (customColor) return customColor

  const preset = PIN_COLORS.find((pinColor) => pinColor.id === color)
  return preset?.hex ?? color
}

const getColorSortValue = (color: string, customColor?: string | null): ColorSortValue => {
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

const getHueGroupLabel = ({ bucket, hue, lightness }: ColorSortValue) => {
  if (bucket === 0) {
    return lightness < 0.34
      ? 'Grayscale — Dark'
      : lightness < 0.67
        ? 'Grayscale — Mid'
        : 'Grayscale — Light'
  }

  if (bucket === 2) return 'Other colors'

  if (hue < 30 || hue >= 330) return 'Red'
  if (hue < 60) return 'Orange'
  if (hue < 90) return 'Yellow'
  if (hue < 150) return 'Green'
  if (hue < 210) return 'Cyan'
  if (hue < 270) return 'Blue'
  return 'Purple'
}
const getReadableIconName = (icon?: string | null) => {
  if (!icon) return 'Default pin'

  return icon
    .replace(/^fa:/, '')
    .replace(/^tabler:/, '')
    .replace(/^Fa/, '')
    .replace(/^Icon/, '')
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

  const filteredAndSortedMarkers = useMemo(() => {
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
                (a.icon ?? '').localeCompare(b.icon ?? '', undefined, { sensitivity: 'base' })
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

  const allFilteredMarkersVisible =
    filteredAndSortedMarkers.length > 0 &&
    filteredAndSortedMarkers.every((marker) => marker.visible)

  const setAllMarkerVisibility = (visible: boolean) => {
    filteredAndSortedMarkers.forEach((marker) => {
      if (marker.visible !== visible) {
        onToggleVisibility(marker.id, visible)
      }
    })
  }

  const renderMarkerRow = (marker: MapMarker) => {
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
          {marker.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
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
    )
  }

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
      {/* The whole title bar closes the panel, mirroring the "Pins" button that
          opens it -- clicking the title to open but having to find the X to
          close is the kind of asymmetry that makes a panel feel fiddly. The X
          stays as the visible affordance. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(false)
          }
        }}
        title="Close panel"
        className="flex cursor-pointer items-center justify-between border-b border-border-subtle px-3 py-2.5 transition-colors hover:bg-surface-secondary"
      >
        <div className="flex items-center gap-2">
          <IconMapPin size={18} className="text-desert-orange" />

          <span className="text-sm font-semibold text-text-primary">Saved Locations</span>

          {markers.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-desert-orange px-1 text-[11px] font-bold text-white">
              {markers.length}
            </span>
          )}
        </div>

        <span
          aria-hidden="true"
          className="rounded p-0.5 text-text-muted transition-colors"
        >
          <IconX size={16} />
        </span>
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
            onChange={(e) => {
              setSortField(e.target.value as SortField)
              setCollapsedGroups(new Set())
            }}
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

        {/* Hide all lived inside the tree view before it was removed; it is the
            one bulk control worth keeping, so it moved up here where it applies
            to whatever the list currently shows. */}
        {filteredAndSortedMarkers.length > 0 && (
          <button
            type="button"
            onClick={() => setAllMarkerVisibility(!allFilteredMarkersVisible)}
            className="w-full rounded bg-[#424420] px-2 py-1 text-xs text-white transition-colors hover:bg-[#525530]"
          >
            {allFilteredMarkersVisible ? 'Hide all' : 'Show all'}
          </button>
        )}
      </div>

      <div className="max-h-[calc(100vh-244px)] overflow-y-auto">
        {markers.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <IconMapPinFilled size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-muted">Click anywhere on the map to drop a pin</p>
          </div>
        ) : filteredAndSortedMarkers.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-text-muted">No pins match your search.</p>
          </div>
        ) : (
          <ul>{filteredAndSortedMarkers.map(renderMarkerRow)}</ul>
        )}
      </div>
    </div>
  )
}
