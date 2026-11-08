import { resolveMarkerIcon } from './marker_icons'
import { useEffect, useMemo, useState } from 'react'
import {
  IconEye,
  IconEyeOff,
  IconMapPin,
  IconMapPinFilled,
  IconTrash,
  IconX,
} from '@tabler/icons-react'

import { PIN_COLORS } from '~/hooks/useMapMarkers'
import type { MapMarker } from '~/hooks/useMapMarkers'
import type { MarkerLayer } from '~/hooks/useMarkerLayers'
import LayersSection from './LayersSection'

interface MarkerPanelProps {
  markers: MapMarker[]
  onDelete: (id: number) => void
  onFlyTo: (longitude: number, latitude: number) => void
  onSelect: (id: number | null) => void
  onToggleVisibility: (id: number, visible: boolean) => void
  selectedMarkerId: number | null
  // Pin layers (#1387)
  layers: MarkerLayer[]
  activeLayerId: number | null
  onSelectLayer: (id: number) => void
  onToggleLayerVisible: (id: number, visible: boolean) => void
  onCreateLayer: (name: string) => Promise<unknown>
  onRenameLayer: (id: number, name: string) => Promise<unknown>
  onDeleteLayer: (id: number) => Promise<string | null>
  layerExportUrl: (layerId?: number) => string
  onImportPins: () => void
  onMovePins: (markerIds: number[], layerId: number) => Promise<void>
}

type SortField = 'name' | 'color' | 'visibility' | 'icon'
type SortDirection = 'asc' | 'desc'

type ColorSortValue = {
  bucket: number
  hue: number
  lightness: number
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

export default function MarkerPanel({
                                      markers,
                                      onDelete,
                                      onFlyTo,
                                      onSelect,
                                      onToggleVisibility,
                                      selectedMarkerId,
                                      layers,
                                      activeLayerId,
                                      onSelectLayer,
                                      onToggleLayerVisible,
                                      onCreateLayer,
                                      onRenameLayer,
                                      onDeleteLayer,
                                      layerExportUrl,
                                      onImportPins,
                                      onMovePins,
                                    }: MarkerPanelProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // The pin whose delete is armed. Deleting a place is not undoable and the
  // names are short and similar, so the trash icon arms rather than deletes.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
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

  // Unchecking a layer hides its pins from the list as well as the map. Pins
  // hidden one at a time stay listed (greyed), since the row is where you
  // turn them back on.
  const hiddenLayerIds = useMemo(
    () => new Set(layers.filter((layer) => !layer.visible).map((layer) => layer.id)),
    [layers]
  )
  const pinsInShownLayers = useMemo(
    () => markers.filter((marker) => !hiddenLayerIds.has(marker.layerId)),
    [markers, hiddenLayerIds]
  )

  const filteredAndSortedMarkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return [...pinsInShownLayers]
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
  }, [pinsInShownLayers, searchQuery, sortField, sortDirection])

  // With more than one layer, list pins under their layer, in layer order.
  const groupedMarkers = useMemo(() => {
    if (layers.length <= 1) return null
    return layers
      .map((layer) => ({
        layer,
        markers: filteredAndSortedMarkers.filter((marker) => marker.layerId === layer.id),
      }))
      .filter((group) => group.markers.length > 0)
  }, [layers, filteredAndSortedMarkers])

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

  useEffect(() => {
    if (pendingDeleteId === null) return

    const stillListed = markers.some((marker) => marker.id === pendingDeleteId)
    if (!stillListed) setPendingDeleteId(null)
  }, [markers, pendingDeleteId])

  useEffect(() => {
    if (pendingDeleteId === null) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingDeleteId(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingDeleteId])

  const renderMarkerRow = (marker: MapMarker) => {
    const MarkerIcon = resolveMarkerIcon(marker.icon)
    const confirmingDelete = pendingDeleteId === marker.id

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

        {confirmingDelete ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onDelete(marker.id)
                setPendingDeleteId(null)
              }}
              className="rounded bg-desert-red px-1.5 py-0.5 text-[11px] font-medium text-white transition-colors hover:brightness-110"
            >
              Delete
            </button>

            <button
              type="button"
              onClick={() => setPendingDeleteId(null)}
              className="rounded border border-border-default px-1.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-secondary"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              // Show the user what they are about to lose before asking. A pin
              // is a place, and its name alone ("Well", "Cache") is not enough
              // to tell two apart -- so fly to it and select it, then confirm.
              setPendingDeleteId(marker.id)
              onSelect(marker.id)
              onFlyTo(marker.longitude, marker.latitude)
            }}
            className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:bg-surface-secondary hover:text-desert-red group-hover:opacity-100"
            title="Delete pin"
          >
            <IconTrash size={14} />
          </button>
        )}
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

      <LayersSection
        layers={layers}
        activeLayerId={activeLayerId}
        onSelect={onSelectLayer}
        onToggleVisible={onToggleLayerVisible}
        onCreate={onCreateLayer}
        onRename={onRenameLayer}
        onDelete={onDeleteLayer}
        exportUrl={layerExportUrl}
        onImport={onImportPins}
      />

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

        {/* Bulk move acts on whatever the list shows, like Hide all: search
            "water", then move just those pins into a Water layer. */}
        {layers.length > 1 && filteredAndSortedMarkers.length > 0 && (
          <select
            value=""
            onChange={async (e) => {
              const layerId = Number(e.target.value)
              if (!layerId) return
              await onMovePins(
                filteredAndSortedMarkers.map((marker) => marker.id),
                layerId
              )
            }}
            className="block w-full rounded border border-border-default bg-surface-primary px-2 py-1 text-xs text-text-primary focus:border-desert-green focus:outline-none"
            aria-label="Move the listed pins to a layer"
          >
            <option value="">
              Move {filteredAndSortedMarkers.length === pinsInShownLayers.length ? 'all' : 'these'}{' '}
              {filteredAndSortedMarkers.length}{' '}
              {filteredAndSortedMarkers.length === 1 ? 'pin' : 'pins'} to layer...
            </option>
            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="max-h-[calc(100vh-420px)] min-h-24 overflow-y-auto">
        {markers.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <IconMapPinFilled size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-muted">Click anywhere on the map to drop a pin</p>
          </div>
        ) : filteredAndSortedMarkers.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-text-muted">
              {pinsInShownLayers.length === 0
                ? 'All layers with pins are hidden. Check a layer above to list its pins.'
                : 'No pins match your search.'}
            </p>
          </div>
        ) : groupedMarkers ? (
          groupedMarkers.map(({ layer, markers: layerMarkers }) => (
            <div key={layer.id}>
              <p className="sticky top-0 bg-surface-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {layer.name}
              </p>
              <ul>{layerMarkers.map(renderMarkerRow)}</ul>
            </div>
          ))
        ) : (
          <ul>{filteredAndSortedMarkers.map(renderMarkerRow)}</ul>
        )}
      </div>
    </div>
  )
}
