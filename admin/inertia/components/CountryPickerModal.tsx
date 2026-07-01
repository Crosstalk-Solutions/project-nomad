import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconCheck, IconSearch, IconX } from '@tabler/icons-react'
import StyledModal, { StyledModalProps } from './StyledModal'
import LoadingSpinner from './LoadingSpinner'
import api from '~/lib/api'
import { formatBytes } from '~/lib/util'
import classNames from '~/lib/classNames'
import {
  EXTRACT_DEFAULT_MAX_ZOOM,
  EXTRACT_MAX_ZOOM,
  EXTRACT_MIN_ZOOM,
} from '../../constants/map_regions'
import type {
  Country,
  CountryCode,
  CountryGroup,
  MapExtractPreflight,
} from '../../types/maps'

export type CountryPickerModalProps = Omit<
  StyledModalProps,
  | 'onConfirm'
  | 'open'
  | 'confirmText'
  | 'cancelText'
  | 'confirmVariant'
  | 'children'
  | 'title'
  | 'large'
> & {
  onDownloadStart?: () => void
  /** Filenames of pmtiles already on disk; used to badge already-installed countries. */
  installedFilenames?: string[]
}

// Single-country extracts use the slug `{iso2 lowercase}_{dateSlug}_z{maxzoom}.pmtiles`,
// matching MapService.buildRegionSlug (which lowercases the alpha-2 country code).
// dateSlug comes from the upstream pmtiles key with `.pmtiles` stripped — currently
// YYYYMMDD but we accept any digits/dashes. Group / custom filenames don't reverse-map
// to country codes, so we skip them here.
const SINGLE_COUNTRY_FILENAME_RE = /^([a-z]{2})_[\w-]+_z\d+\.pmtiles$/

const CountryPickerModal: React.FC<CountryPickerModalProps> = ({
  onDownloadStart,
  installedFilenames = [],
  ...modalProps
}) => {
  const [selected, setSelected] = useState<Set<CountryCode>>(new Set())
  const [search, setSearch] = useState('')
  const [maxzoom, setMaxzoom] = useState<number>(EXTRACT_DEFAULT_MAX_ZOOM)
  const [preflight, setPreflight] = useState<MapExtractPreflight | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const preflightRequestIdRef = useRef(0)

  const { data: countries = [], isLoading: countriesLoading } = useQuery({
    queryKey: ['maps-countries'],
    queryFn: () => api.listCountries(),
    staleTime: Infinity,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['maps-country-groups'],
    queryFn: () => api.listCountryGroups(),
    staleTime: Infinity,
  })

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? countries.filter(
          (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
        )
      : countries

    const buckets: Record<string, Country[]> = {}
    for (const country of filtered) {
      if (!buckets[country.continent]) buckets[country.continent] = []
      buckets[country.continent].push(country)
    }
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))
  }, [countries, search])

  const selectedCountries = useMemo(
    () => countries.filter((c) => selected.has(c.code)),
    [countries, selected]
  )

  const installedCountrySet = useMemo(() => {
    const set = new Set<CountryCode>()
    for (const filename of installedFilenames) {
      const match = SINGLE_COUNTRY_FILENAME_RE.exec(filename)
      if (match) set.add(match[1].toUpperCase() as CountryCode)
    }
    return set
  }, [installedFilenames])

  function toggleCountry(code: CountryCode) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleGroup(group: CountryGroup) {
    setSelected((prev) => {
      const next = new Set(prev)
      const allIn = group.countries.every((c) => next.has(c))
      if (allIn) {
        group.countries.forEach((c) => next.delete(c))
      } else {
        group.countries.forEach((c) => next.add(c))
      }
      return next
    })
  }

  function clearAll() {
    setSelected(new Set())
  }

  // Auto-refresh the preflight whenever selection or maxzoom changes. Debounced
  // so rapid multi-select clicks and slider drags collapse into a single CDN
  // round-trip. Loading state only flips after the debounce expires so the UI
  // stays interactive during the wait. Stale-safe via requestId so an earlier
  // slow response can't clobber a later one.
  useEffect(() => {
    if (selected.size === 0) {
      setPreflight(null)
      setErrorMessage(null)
      setLoading(false)
      preflightRequestIdRef.current++
      return
    }

    setErrorMessage(null)
    const timer = setTimeout(async () => {
      const requestId = ++preflightRequestIdRef.current
      setLoading(true)
      try {
        const res = await api.extractMapPreflight({
          countries: [...selected],
          maxzoom,
        })
        if (requestId !== preflightRequestIdRef.current) return
        if (!res) throw new Error('Preflight returned no data')
        setPreflight(res)
      } catch (err: any) {
        if (requestId !== preflightRequestIdRef.current) return
        console.error('Preflight failed:', err)
        setErrorMessage(err?.message ?? 'Estimate failed')
      } finally {
        if (requestId === preflightRequestIdRef.current) setLoading(false)
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [selected, maxzoom])

  async function startDownload() {
    if (selected.size === 0) {
      setErrorMessage('Pick at least one country before downloading.')
      return
    }
    if (loading || !preflight) {
      setErrorMessage('Still estimating size — hold on a moment.')
      return
    }
    try {
      setDownloading(true)
      setErrorMessage(null)
      await api.extractMapRegion({
        countries: [...selected],
        maxzoom,
        estimatedBytes: preflight?.bytes,
      })
      onDownloadStart?.()
    } catch (err: any) {
      console.error('Extract dispatch failed:', err)
      setErrorMessage(err?.message ?? 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <StyledModal
      {...modalProps}
      title="Download map by country or region"
      open={true}
      confirmText="Start Download"
      confirmIcon="IconDownload"
      cancelText="Cancel"
      confirmVariant="primary"
      confirmLoading={loading || downloading}
      cancelLoading={loading || downloading}
      onConfirm={startDownload}
      large
    >
      <div className="flex flex-col text-left gap-4 min-h-[60vh]">
        <div className="flex gap-3 items-stretch">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${countries.length} countries...`}
              className="w-full pl-9 pr-3 py-2 rounded-md border border-border-default bg-surface-primary text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-desert-green"
            />
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-text-muted hover:text-text-primary px-3 cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        {groups.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted mb-2">
              Quick picks
            </p>
            <div className="flex flex-wrap gap-2">
              {groups.map((group) => {
                const allIn =
                  group.countries.length > 0 &&
                  group.countries.every((c) => selected.has(c))
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className={classNames(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                      allIn
                        ? 'bg-desert-green text-white border-desert-green'
                        : 'bg-surface-primary text-text-primary border-border-default hover:border-desert-green'
                    )}
                  >
                    {allIn && <IconCheck className="inline w-3 h-3 mr-1" />}
                    {group.name}{' '}
                    <span className="opacity-60">({group.countries.length})</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto max-h-96 border border-border-default rounded-md bg-surface-secondary">
          {countriesLoading ? (
            <div className="flex items-center justify-center h-40">
              <LoadingSpinner />
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-text-muted text-sm p-6 text-center">
              No countries match "{search}".
            </p>
          ) : (
            grouped.map(([continent, list]) => (
              <div key={continent}>
                <div className="sticky top-0 bg-surface-secondary border-b border-border-default px-4 py-2 text-xs uppercase tracking-wide text-text-muted font-semibold z-10">
                  {continent}
                </div>
                <ul>
                  {list.map((country) => {
                    const isSelected = selected.has(country.code)
                    const isInstalled = installedCountrySet.has(country.code)
                    return (
                      <li key={country.code}>
                        <button
                          type="button"
                          onClick={() => toggleCountry(country.code)}
                          className={classNames(
                            'w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors cursor-pointer',
                            isSelected
                              ? 'bg-desert-green/10 hover:bg-desert-green/15'
                              : 'hover:bg-surface-primary'
                          )}
                        >
                          <span
                            className={classNames(
                              'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                              isSelected
                                ? 'bg-desert-green border-desert-green'
                                : 'border-border-default'
                            )}
                          >
                            {isSelected && <IconCheck className="w-3 h-3 text-white" />}
                          </span>
                          <span className="flex-1 text-text-primary">{country.name}</span>
                          {isInstalled && (
                            <span
                              className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-desert-green/15 text-desert-green border border-desert-green/30"
                              title="Already downloaded — re-select to update with a different zoom"
                            >
                              Installed
                            </span>
                          )}
                          <span className="text-xs font-mono text-text-muted">
                            {country.code}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {selectedCountries.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted mb-2">
              {selectedCountries.length} selected
            </p>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {selectedCountries.map((country) => (
                <span
                  key={country.code}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-desert-green text-white text-xs"
                >
                  {country.name}
                  <button
                    type="button"
                    onClick={() => toggleCountry(country.code)}
                    className="hover:bg-white/20 rounded cursor-pointer"
                    aria-label={`Remove ${country.name}`}
                  >
                    <IconX className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm text-text-primary font-medium mb-2">
            Max zoom level: <span className="font-mono">{maxzoom}</span>
          </label>
          <input
            type="range"
            min={EXTRACT_MIN_ZOOM}
            max={EXTRACT_MAX_ZOOM}
            step={1}
            value={maxzoom}
            onChange={(e) => setMaxzoom(parseInt(e.target.value, 10))}
            className="w-full accent-desert-green"
            disabled={downloading}
          />
          <div className="flex justify-between text-xs text-text-muted mt-1 font-mono">
            <span>z{EXTRACT_MIN_ZOOM} (world)</span>
            <span>z{EXTRACT_MAX_ZOOM} (street)</span>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Lower zoom = smaller file, less detail. Zoom 15 shows individual streets;
            zoom 10 shows city-level detail.
          </p>
        </div>

        <div className="bg-surface-secondary border border-border-default rounded-md p-3 min-h-14 text-sm font-mono">
          <PreflightStatus
            errorMessage={errorMessage}
            loading={loading}
            preflight={preflight}
            hasSelection={selected.size > 0}
          />
        </div>

      </div>
    </StyledModal>
  )
}

type PreflightStatusProps = {
  errorMessage: string | null
  loading: boolean
  preflight: MapExtractPreflight | null
  hasSelection: boolean
}

function PreflightStatus({ errorMessage, loading, preflight, hasSelection }: PreflightStatusProps) {
  if (errorMessage) {
    return <p className="text-desert-red">{errorMessage}</p>
  }
  if (loading) {
    return <p className="text-text-muted">Estimating size…</p>
  }
  if (preflight) {
    return (
      <p className="text-text-primary">
        {preflight.tiles.toLocaleString()} tiles, ~{formatBytes(preflight.bytes, 1)}{' '}
        <span className="text-text-muted">(source build {preflight.source.date})</span>
      </p>
    )
  }
  if (!hasSelection) {
    return <p className="text-text-muted">Pick at least one country to estimate size.</p>
  }
  return <p className="text-text-muted">Estimating size…</p>
}

export default CountryPickerModal
