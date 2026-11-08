import { useEffect, useMemo, useRef, useState } from 'react'
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import {
  IconBuildingCommunity,
  IconDroplet,
  IconLoader2,
  IconMap2,
  IconMapPin,
  IconRoad,
} from '@tabler/icons-react'

import api from '~/lib/api'
import {
  filterRegions,
  formatPlaceDistance,
  parseLatLng,
  placeKindLabel,
  type JumpRegion,
  type PlaceResult,
} from '~/lib/map_jump'
import type { MapPlaceIndexStatus } from '../../../types/maps'

type Item = { type: 'region'; region: JumpRegion } | { type: 'place'; place: PlaceResult }

type MapJumpSearchProps = {
  text: string
  onTextChange: (text: string) => void
  regions: JumpRegion[]
  onPickRegion: (region: JumpRegion) => void
  onPickPlace: (place: PlaceResult) => void
  /** Enter with nothing highlighted, e.g. on "lat,lng" */
  onSubmitText: () => void
  /** Where the map is looking, so nearby places rank first */
  getNear: () => { lat: number; lng: number } | null
}

const SEARCH_DEBOUNCE_MS = 200
const MIN_QUERY_LENGTH = 2

function placeIcon(layer: string) {
  if (layer === 'places') return IconBuildingCommunity
  if (layer === 'roads') return IconRoad
  if (layer === 'water') return IconDroplet
  return IconMapPin
}

function scaleUnit(): string | null {
  try {
    return localStorage.getItem('nomad:map-scale-unit')
  } catch {
    return null
  }
}

/**
 * The map title bar's "Jump to" box: downloaded regions by name, places found by offline
 * search (#1574), or a typed lat,lng. Regions are matched in the browser; places come from
 * /api/maps/search as the user types.
 */
export default function MapJumpSearch({
  text,
  onTextChange,
  regions,
  onPickRegion,
  onPickPlace,
  onSubmitText,
  getNear,
}: MapJumpSearchProps) {
  const [places, setPlaces] = useState<PlaceResult[]>([])
  const [status, setStatus] = useState<MapPlaceIndexStatus | null>(null)
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const query = text.trim()
  const isCoordinates = parseLatLng(query) !== null
  const searchable = !isCoordinates && query.length >= MIN_QUERY_LENGTH

  useEffect(() => {
    abortRef.current?.abort()
    if (!searchable) {
      setPlaces([])
      setSearching(false)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    abortRef.current = controller
    const timer = window.setTimeout(async () => {
      const near = getNear()
      const response = await api.searchMapPlaces(
        { q: query, ...(near ? { lat: near.lat, lng: near.lng } : {}), limit: 8 },
        controller.signal
      )
      if (controller.signal.aborted) return
      setPlaces(response?.results ?? [])
      if (response?.status) setStatus(response.status)
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // getNear is read at request time; it isn't a reason to search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchable])

  const matchingRegions = useMemo(
    () => (isCoordinates ? [] : filterRegions(query, regions)),
    [isCoordinates, query, regions]
  )
  const unit = scaleUnit()
  const indexing = (status?.pending ?? 0) > 0
  const hasOptions = matchingRegions.length > 0 || places.length > 0
  const showNoResults = searchable && !searching && !hasOptions

  return (
    <Combobox<Item | null>
      value={null}
      onChange={(item) => {
        if (!item) return
        // Clear right away so the next visit to the box starts with the full region list.
        onTextChange('')
        if (item.type === 'region') onPickRegion(item.region)
        else onPickPlace(item.place)
      }}
      // Typing replaces the (empty) selection; nothing stays "selected" after a jump.
      immediate
    >
      <div className="relative">
        <ComboboxInput
          aria-label="Jump to a downloaded region, a place, or coordinates"
          placeholder={regions.length > 0 ? 'Jump to: place, region or lat,lng' : 'lat,lng'}
          autoComplete="off"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            // Headless UI selects the highlighted option on Enter; with none (e.g. a lat,lng
            // that matches no option) fall back to the box's own action.
            if (event.key === 'Enter' && !hasOptions) onSubmitText()
          }}
          className="w-72 rounded border border-border-default bg-surface-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:border-desert-green focus:outline-none"
        />

        <ComboboxOptions
          anchor="bottom start"
          className="z-[60] mt-1 max-h-[60vh] w-[22rem] overflow-y-auto rounded-lg border border-border-subtle bg-surface-primary py-1 text-sm shadow-lg empty:invisible"
        >
          {matchingRegions.length > 0 && (
            <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Downloaded regions
            </div>
          )}
          {matchingRegions.map((region) => (
            <ComboboxOption
              key={`region:${region.file}`}
              value={{ type: 'region', region } satisfies Item}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-text-primary data-[focus]:bg-surface-secondary"
            >
              <IconMap2 size={16} className="shrink-0 text-desert-green" />
              <span className="truncate">{region.label}</span>
            </ComboboxOption>
          ))}

          {places.length > 0 && (
            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Places
            </div>
          )}
          {places.map((place) => {
            const Icon = placeIcon(place.layer)
            const details = [
              placeKindLabel(place.kind),
              place.nameEn,
              place.distanceKm !== null ? formatPlaceDistance(place.distanceKm, unit) : null,
            ].filter(Boolean)
            return (
              <ComboboxOption
                key={`place:${place.layer}:${place.kind}:${place.name}:${place.lat}:${place.lng}`}
                value={{ type: 'place', place } satisfies Item}
                className="flex cursor-pointer items-start gap-2 px-3 py-1.5 data-[focus]:bg-surface-secondary"
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-desert-orange" />
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">{place.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {details.join(' · ')}
                  </span>
                </span>
              </ComboboxOption>
            )
          })}

          {searchable && searching && !hasOptions && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
              <IconLoader2 size={14} className="animate-spin" /> Searching…
            </div>
          )}
          {showNoResults && (
            <div className="px-3 py-2 text-xs text-text-muted">
              No places found in your downloaded regions.
            </div>
          )}
          {searchable && indexing && (
            <div className="border-t border-border-subtle px-3 pb-1 pt-2 text-xs text-text-muted">
              Indexing {status!.pending} new {status!.pending === 1 ? 'region' : 'regions'} for
              search — more places will appear shortly.
            </div>
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
