import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import type { MapRegionState, MapRegionUpdateState } from '../../../types/map_regions'
import { isInstallableTerritory, mapRegionTerritory } from '../../../app/utils/map_region_territory'
import {
  getMapRegions,
  getMapOperations,
  installMapRegion,
  removeMapRegion,
  updateMapRegion,
  checkMapRegionUpdates,
  refreshMapRegionCatalog,
  MAP_REGIONS_KEY,
  MAP_OPERATIONS_KEY,
  type MapRegionEstimate,
} from '~/lib/map_regions_api'
import {
  countryTerritoryGroups,
  territoryGroupMatches,
  territoryRegionMatches,
  territoryRouteReady,
  territoryRouteProvider,
  territoryNeedsAttention,
  routingTerritoryRegion,
  regionAncestorIds,
  regionBreadcrumb,
  regionHasOwnActivity,
  normalizeRegionText,
  type CountryTerritoryGroup,
  type TerritoryFilter,
} from '~/lib/map_region_tree'
import { regionOperationBusy } from '~/lib/map_region_downloads'
import { mapApiErrorMessage } from '~/lib/map_api_error'
import { operationWorkLabel } from '~/lib/map_region_operation_ui'
import { formatBytes } from '~/lib/util'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import StyledButton from '~/components/StyledButton'
import StyledModal from '~/components/StyledModal'
import Alert from '~/components/Alert'
import MapRegionDownloadEstimate from './MapRegionDownloadEstimate'
import MapRegionOperationCard from './MapRegionOperationCard'
import MapRegionTreeActivity from './MapRegionTreeActivity'

type Action = { kind: 'install' | 'update' | 'remove'; region: MapRegionState }
const dateLabel = (value?: string) =>
  value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('en') : value
const updateLabel = (value?: MapRegionUpdateState) =>
  value?.status === 'up_to_date'
    ? 'Up to date'
    : value?.status === 'available'
      ? 'Update available'
      : value?.status === 'unknown' || value?.status === 'unavailable'
        ? 'Update status could not be confirmed'
        : 'Updates not checked'
const busy = (region?: MapRegionState) => regionOperationBusy(region?.components.routing?.status)
const stopped = (region?: MapRegionState) =>
  ['failed', 'cancelled'].includes(region?.components.routing?.status || '')

export default function OfflineRegionsManager() {
  const client = useQueryClient()
  const initialId = useRef(new URLSearchParams(window.location.search).get('region') || '')
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState<TerritoryFilter>('all')
  const [geography, setGeography] = useState('')
  const [selected, setSelected] = useState(initialId.current)
  const [openGroup, setOpenGroup] = useState('')
  const [advanced, setAdvanced] = useState(new Set<string>())
  const [confirmation, setConfirmation] = useState<Action | null>(null)
  const [notice, setNotice] = useState('')
  const [estimates, setEstimates] = useState<Record<string, MapRegionEstimate | undefined>>({})
  const [lastAction, setLastAction] = useState<'change' | 'check' | 'catalog' | null>(null)
  const revealed = useRef(false)
  const focusPanel = useRef(false)
  const activeBefore = useRef(new Set<string>())
  const query = useQuery({
    queryKey: MAP_REGIONS_KEY,
    queryFn: getMapRegions,
    refetchInterval: (q) => (q.state.data?.regions.some((region) => busy(region)) ? 30000 : false),
  })
  const operations = useQuery({
    queryKey: MAP_OPERATIONS_KEY,
    queryFn: getMapOperations,
    refetchInterval: (q) =>
      q.state.data?.operations.some((region) =>
        regionOperationBusy(region.components.routing?.status)
      )
        ? 3000
        : 10000,
  })
  const invalidate = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: MAP_REGIONS_KEY }),
      client.invalidateQueries({ queryKey: MAP_OPERATIONS_KEY }),
      client.invalidateQueries({ queryKey: ['routing-coverage'] }),
    ])
  }, [client])
  useEffect(() => {
    if (!operations.data) return
    const active = new Set(
      operations.data.operations
        .filter((item) => regionOperationBusy(item.components.routing?.status))
        .map((item) => item.regionId + '|' + item.components.routing?.operation?.id)
    )
    if ([...activeBefore.current].some((id) => !active.has(id))) void invalidate()
    activeBefore.current = active
  }, [operations.data, invalidate])
  const regions = useMemo(() => {
    const merged = (query.data?.regions || []).map((region) => {
      const update = operations.data?.operations.find((item) => item.regionId === region.id)
        ?.components.routing
      const state = region.components.routing ? { ...region.components.routing, ...update } : update
      if (operations.isError && state?.operation)
        state.operation = { ...state.operation, activity: 'unavailable', retryable: false }
      return { ...region, components: state ? { routing: state } : {} }
    })
    return merged.map((region) => routingTerritoryRegion(region, merged))
  }, [query.data?.regions, operations.data, operations.isError])
  const groups = useMemo(() => countryTerritoryGroups(regions), [regions])
  const collections = useMemo(
    () =>
      regions
        .filter(
          (region) =>
            region.id !== 'world' && mapRegionTerritory(region).territoryScope === 'collection'
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'en')),
    [regions]
  )
  const visibleGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          territoryGroupMatches(group, regions, filter, status) &&
          (!geography ||
            [...(group.country ? [group.country] : []), ...group.regions].some((region) =>
              regionAncestorIds(regions, region.id).includes(geography)
            ))
      ),
    [groups, regions, filter, status, geography]
  )
  const ownerGroup = groups.find(
    (group) =>
      group.country?.id === selected ||
      group.id === selected ||
      group.regions.some((region) => region.id === selected)
  )
  const rememberEstimate = useCallback((id: string, value?: MapRegionEstimate) => {
    setEstimates((previous) => (previous[id] === value ? previous : { ...previous, [id]: value }))
  }, [])
  useEffect(() => {
    if (revealed.current || !regions.length) return
    revealed.current = true
    if (ownerGroup) {
      setOpenGroup(ownerGroup.id)
      if (ownerGroup.country?.id !== selected)
        setAdvanced((previous) => new Set([...previous, ownerGroup.id]))
    } else if (collections.some((region) => region.id === selected)) setGeography(selected)
  }, [regions.length, selected, ownerGroup?.id])
  useEffect(() => {
    if (!focusPanel.current) return
    const heading = document.getElementById('territory-heading-' + selected)
    if (heading) {
      heading.focus({ preventScroll: true })
      heading.scrollIntoView({
        block: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
      focusPanel.current = false
    }
  }, [selected, openGroup])
  const mutation = useMutation({
    mutationFn: (action: Action) =>
      action.kind === 'remove'
        ? removeMapRegion(action.region.id, 'routing')
        : action.kind === 'update'
          ? updateMapRegion(action.region.id, ['routing'])
          : installMapRegion(action.region.id, ['routing']),
    onMutate: () => {
      setLastAction('change')
      setNotice('')
    },
    onSuccess: async (_value, action) => {
      setConfirmation(null)
      setNotice(
        action.kind === 'remove'
          ? 'The selected routing data was removed.'
          : 'Route preparation queued. Follow its progress in this territory.'
      )
      await invalidate()
    },
  })
  const confirmAction = (action: Action) => {
    mutation.reset()
    setConfirmation(action)
  }
  const check = useMutation({
    mutationFn: (id?: string) => checkMapRegionUpdates(id),
    onMutate: () => {
      setLastAction('check')
      setNotice('')
    },
    onSuccess: async (result) => {
      const available = result.results.filter(
        (item) => item.component === 'routing' && item.update.status === 'available'
      ).length
      const uncertain = result.results.filter((item) =>
        ['unknown', 'unavailable'].includes(item.update.status)
      ).length
      setNotice(
        !result.checked
          ? 'No installed routing territories to check.'
          : `${result.checked} routing source(s) checked. ${available ? `${available} update(s) available.` : uncertain ? 'Some update statuses could not be confirmed.' : 'Up to date.'} No downloads were started.`
      )
      await invalidate()
    },
  })
  const refresh = useMutation({
    mutationFn: refreshMapRegionCatalog,
    onMutate: () => {
      setLastAction('catalog')
      setNotice('')
    },
    onSuccess: async () => {
      setNotice('Public territory catalog refreshed. Installed routes are preserved.')
      await invalidate()
    },
  })
  const changing = mutation.isPending || check.isPending || refresh.isPending
  const error =
    lastAction === 'change'
      ? mutation.error
      : lastAction === 'check'
        ? check.error
        : lastAction === 'catalog'
          ? refresh.error
          : null
  const chooseRegion = (group: CountryTerritoryGroup, id: string) => {
    setOpenGroup(group.id)
    setSelected(id)
    focusPanel.current = true
  }
  const goToOwner = (id: string) => {
    const group = groups.find(
      (item) => item.country?.id === id || item.regions.some((region) => region.id === id)
    )
    if (!group) return
    setFilter('')
    setStatus('all')
    setGeography('')
    chooseRegion(group, id)
  }
  const details = (region: MapRegionState) => {
    const state = region.components.routing
    const owner = territoryRouteProvider(region)
    const ready = territoryRouteReady(region, regions)
    const supported = isInstallableTerritory(region)
    return (
      <details className="mt-4 text-xs text-text-secondary">
        <summary className="cursor-pointer font-medium">Details</summary>
        <div className="mt-2 space-y-2 break-words">
          <p>{regionBreadcrumb(regions, region.id)}</p>
          {state?.installedBytes !== undefined && (
            <p>Installed route data: {formatBytes(state.installedBytes)}</p>
          )}
          {(state?.installedVersion || owner?.version) && (
            <p className="break-all">Version: {state?.installedVersion || owner?.version}</p>
          )}
          {(state?.dataDate || region.dataDate) && (
            <p>Source date: {state?.dataDate || region.dataDate}</p>
          )}
          {region.sources.routing && (
            <a
              href={region.sources.routing.url}
              target="_blank"
              rel="noreferrer"
              className="block text-desert-green underline"
            >
              Public source · {region.sources.routing.sourceId}
            </a>
          )}
          {ready && !owner && supported && (
            <div className="border-t border-border-subtle pt-2">
              <p>{updateLabel(state?.update)}</p>
              {state?.update?.checkedAt && (
                <p className="mt-1 text-text-muted">
                  Last checked: {dateLabel(state.update.checkedAt)}
                </p>
              )}
              {state?.update?.error && <p className="mt-1 text-text-muted">{state.update.error}</p>}
              {!busy(region) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <StyledButton
                    size="sm"
                    variant="outline"
                    disabled={changing}
                    onClick={() => check.mutate(region.id)}
                  >
                    Check for updates
                  </StyledButton>
                  {state?.update?.status === 'available' && (
                    <StyledButton
                      size="sm"
                      variant="action"
                      disabled={changing || !query.data?.builderReady}
                      onClick={() => confirmAction({ kind: 'update', region })}
                    >
                      Update routes
                    </StyledButton>
                  )}
                </div>
              )}
              <p className="mt-2 text-text-muted">
                Checking the public source needs an internet connection. Installed routes continue
                to work offline.
              </p>
            </div>
          )}
          {!owner && !busy(region) && (ready || stopped(region)) && (
            <div className="border-t border-border-subtle pt-2">
              {!!state?.dependents?.length && (
                <p className="mb-2">
                  This data also supplies {state.dependents.length} published region(s).
                </p>
              )}
              <StyledButton
                size="sm"
                variant="danger"
                disabled={changing}
                onClick={() => confirmAction({ kind: 'remove', region })}
              >
                {ready ? 'Remove route data' : 'Remove stopped task'}
              </StyledButton>
            </div>
          )}
          {region.attribution && <p className="text-text-muted">{region.attribution}</p>}
        </div>
      </details>
    )
  }
  const controls = (region: MapRegionState) => {
    const state = region.components.routing
    const owner = territoryRouteProvider(region)
    const ready = territoryRouteReady(region, regions)
    const source = region.sources.routing
    const pendingOwner = state?.pendingProvider
    const supported = isInstallableTerritory(region)
    const hasTask = busy(region) || stopped(region) || state?.operation?.activity === 'unavailable'
    return (
      <>
        {hasTask && (
          <MapRegionOperationCard
            key={region.id}
            regionId={region.id}
            name={region.name}
            components={region.components}
            showRegionLink={false}
            surface="inline"
            allowRetry={supported}
          />
        )}
        {!hasTask && ready && (
          <p role="status" className="font-semibold text-desert-green">
            Ready offline{owner ? ` · supplied by ${owner.name}` : ''}
          </p>
        )}
        {owner && ready && (
          <div className="mt-2 text-sm text-text-secondary">
            <p>No separate download is needed. This region uses its installed country graph.</p>
            <StyledButton size="sm" variant="outline" onClick={() => goToOwner(owner.regionId)}>
              Manage {owner.name}
            </StyledButton>
          </div>
        )}
        {!hasTask && !ready && pendingOwner && (
          <p className="text-sm text-text-secondary">
            Included in the preparation for {pendingOwner.name}. Follow that territory's progress;
            no separate download is needed.
          </p>
        )}
        {supported && source && !hasTask && !ready && !pendingOwner && (
          <>
            <MapRegionDownloadEstimate
              regionId={region.id}
              components={['routing']}
              onEstimate={rememberEstimate}
            />
            <StyledButton
              size="sm"
              icon="IconDownload"
              disabled={
                changing ||
                !query.data?.builderReady ||
                estimates[region.id]?.spaceSufficient === false
              }
              onClick={() => confirmAction({ kind: 'install', region })}
            >
              Install routes
            </StyledButton>
            <p className="mt-2 text-xs text-text-muted">
              One action obtains any missing source, builds car and walking routes, verifies the
              graph and makes it available offline.
            </p>
          </>
        )}
        {!source && !ready && !hasTask && (
          <p className="text-sm text-text-secondary">
            A whole-territory routing package is not published here. Choose one of the public
            regions below.
          </p>
        )}
        {details(region)}
      </>
    )
  }
  const text = normalizeRegionText(filter)
  const matchesTerritory = (group: CountryTerritoryGroup, region: MapRegionState) =>
    territoryRegionMatches(
      region,
      regions,
      normalizeRegionText(`${group.name} ${group.countryCode}`).includes(text) ? '' : text,
      status
    )
  const activeOutside = groups.flatMap((group) =>
    [...(group.country ? [group.country] : []), ...group.regions].filter(
      (region) =>
        busy(region) && (!visibleGroups.includes(group) || !matchesTerritory(group, region))
    )
  ).length
  const actionRegion = confirmation?.region
  const actionEstimate = actionRegion ? estimates[actionRegion.id] : undefined
  const destructive = confirmation?.kind === 'remove'
  return (
    <section id="offline-regions" className="mb-10 mt-8 min-w-0" aria-label="Offline territories">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <StyledSectionHeader title="Offline territories" className="!mb-0" />
        <Link href="/docs/maps" className="text-sm font-medium text-desert-green underline">
          Maps guide
        </Link>
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        Choose a country for offline car and walking routes. Published subregions are optional under
        Advanced regions. Visual map files are managed separately below.
      </p>
      {query.isError && (
        <Alert
          type="error"
          title="Territory catalog unavailable"
          message={mapApiErrorMessage(query.error, 'Could not read the cached territory catalog.')}
        />
      )}
      {query.data && !query.data.builderReady && (
        <Alert
          type="warning"
          title="Route preparation service unavailable"
          message="Installed routes remain usable. Restore the local preparation service before installing another territory."
        />
      )}
      {operations.isError && (
        <Alert
          type="warning"
          title="Live task status unavailable"
          message="Last known data is shown. Refresh local state before starting another preparation."
        />
      )}
      {notice && (
        <p
          role="status"
          className="my-3 rounded border border-border-default bg-surface-primary p-3 text-sm text-text-secondary"
        >
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="my-3 text-sm text-desert-red">
          {mapApiErrorMessage(error, 'The territory operation could not be completed.')}
        </p>
      )}
      <div className="mb-3 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <label htmlFor="offline-region-filter" className="block text-sm text-text-primary">
            Find a country or published region
          </label>
          <input
            id="offline-region-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Brazil, Portugal, California…"
            className="mt-1 block w-full rounded border border-border-default bg-surface-primary px-3 py-2 text-text-primary"
          />
        </div>
        <div>
          <label htmlFor="offline-territory-status" className="block text-sm text-text-primary">
            Show
          </label>
          <select
            id="offline-territory-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TerritoryFilter)}
            className="mt-1 w-full rounded border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
          >
            <option value="all">All</option>
            <option value="installed">Installed</option>
            <option value="progress">In progress</option>
            <option value="attention">Needs attention</option>
          </select>
        </div>
        <div>
          <label htmlFor="offline-territory-geography" className="block text-sm text-text-primary">
            Browse geography
          </label>
          <select
            id="offline-territory-geography"
            value={geography}
            onChange={(event) => setGeography(event.target.value)}
            className="mt-1 w-full rounded border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
          >
            <option value="">All countries</option>
            {collections.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!!activeOutside && (
        <p className="mb-3 text-sm text-text-secondary">
          {activeOutside} routing task(s) outside this filter.{' '}
          <button
            type="button"
            onClick={() => {
              setFilter('')
              setStatus('progress')
              setGeography('')
            }}
            className="text-desert-green underline"
          >
            Show in progress
          </button>
        </p>
      )}
      <nav
        aria-label="Countries and published routing territories"
        className="min-w-0 rounded border border-border-default bg-surface-primary p-2 sm:p-3"
      >
        <ul className="min-w-0 divide-y divide-border-subtle">
          {visibleGroups.map((group, index) => {
            const opened = openGroup === group.id
            const own = group.country
            const matchedCountry = own && matchesTerritory(group, own) ? own : undefined
            const childMatches = group.regions.filter((region) => matchesTerritory(group, region))
            const showChildren = opened && advanced.has(group.id)
            const ready = territoryRouteReady(own, regions)
            const selectedRegion = opened
              ? childMatches.find((region) => region.id === selected) || matchedCountry
              : undefined
            const activity = [
              ...(matchedCountry ? [matchedCountry] : []),
              ...(!showChildren ? childMatches : []),
            ].filter(
              (region) => region.id !== selectedRegion?.id && regionHasOwnActivity(region)
            )
            const someReady = group.regions.some((region) => territoryRouteReady(region, regions))
            const currentName = selectedRegion?.name || group.name
            const close = () => {
              setOpenGroup('')
              document.getElementById('territory-country-' + group.countryCode)?.focus()
            }
            return (
              <li key={group.id} className="min-w-0 py-1">
                <button
                  type="button"
                  id={'territory-country-' + group.countryCode}
                  aria-expanded={opened}
                  aria-controls={'territory-controls-' + group.id}
                  className={`flex min-h-12 w-full min-w-0 items-start gap-2 rounded px-2 py-3 text-left focus-visible:outline-2 focus-visible:outline-desert-green ${opened ? 'bg-surface-secondary' : 'hover:bg-surface-secondary/60'}`}
                  onClick={() => {
                    if (opened) close()
                    else {
                      setOpenGroup(group.id)
                      if (ownerGroup?.id !== group.id) setSelected(matchedCountry?.id || group.id)
                      if (!matchedCountry)
                        setAdvanced((previous) => new Set([...previous, group.id]))
                    }
                  }}
                  onKeyDown={(event) => {
                    const key = event.key
                    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
                      event.preventDefault()
                      const next =
                        key === 'Home'
                          ? 0
                          : key === 'End'
                            ? visibleGroups.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  visibleGroups.length - 1,
                                  index + (key === 'ArrowDown' ? 1 : -1)
                                )
                              )
                      document
                        .getElementById('territory-country-' + visibleGroups[next].countryCode)
                        ?.focus()
                    } else if (key === 'Escape' && opened) {
                      event.preventDefault()
                      close()
                    }
                  }}
                >
                  {opened ? (
                    <IconChevronDown size={18} className="mt-0.5 shrink-0" aria-hidden />
                  ) : (
                    <IconChevronRight size={18} className="mt-0.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-text-primary">
                      {group.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {busy(own)
                        ? operationWorkLabel(
                            own?.components.routing?.operation?.phase || 'queued',
                            own?.components.routing?.operation?.detail
                          )
                        : own && territoryNeedsAttention(own)
                          ? 'Needs attention'
                          : ready
                            ? 'Ready offline'
                            : someReady
                              ? 'Some published regions are installed'
                              : own?.sources.routing
                                ? 'Country routing package available'
                                : 'Choose a published region'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">{group.countryCode}</span>
                </button>
                <div className="px-3 pb-1">
                  <MapRegionTreeActivity
                    regions={activity}
                    ownerId={own?.id || group.id}
                    onReveal={() => {
                      setOpenGroup(group.id)
                      setAdvanced((previous) => new Set([...previous, group.id]))
                      setSelected(matchedCountry?.id || group.id)
                    }}
                  />
                </div>
                {opened && (
                  <article
                    id={'territory-controls-' + group.id}
                    className="my-2 ml-2 min-w-0 rounded-r border-l-2 border-desert-green bg-surface-secondary p-3 sm:ml-7 sm:p-4"
                    aria-label={`Territory details: ${currentName}`}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && !confirmation) {
                        event.preventDefault()
                        event.stopPropagation()
                        close()
                      }
                    }}
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-text-muted">
                          {group.name}
                          {selectedRegion && selectedRegion.id !== group.country?.id
                            ? ' / Published region'
                            : ''}
                        </p>
                        <h3
                          id={'territory-heading-' + selected}
                          tabIndex={-1}
                          className="break-words text-lg font-semibold text-text-primary outline-none"
                        >
                          {currentName}
                        </h3>
                      </div>
                      <StyledButton size="sm" variant="ghost" onClick={close}>
                        Close controls
                      </StyledButton>
                    </div>
                    {selectedRegion && matchedCountry && selectedRegion.id !== matchedCountry.id && (
                      <button
                        type="button"
                        className="mb-3 text-xs text-desert-green underline"
                        onClick={() => chooseRegion(group, matchedCountry.id)}
                      >
                        Back to {group.name}
                      </button>
                    )}
                    {selectedRegion ? (
                      controls(selectedRegion)
                    ) : (
                      <p className="text-sm text-text-secondary">
                        {group.country
                          ? 'Choose a published region below.'
                          : 'No single-country source is published for this country. Choose an available public region below.'}
                      </p>
                    )}
                    {!!childMatches.length && (
                      <details
                        open={showChildren}
                        className="mt-5 border-t border-border-subtle pt-3"
                        onToggle={(event) => {
                          const nextOpen = event.currentTarget.open
                          setAdvanced((previous) => {
                            const next = new Set(previous)
                            if (nextOpen) next.add(group.id)
                            else next.delete(group.id)
                            return next
                          })
                        }}
                      >
                        <summary className="cursor-pointer text-sm font-medium text-text-primary">
                          Advanced regions · {childMatches.length}
                        </summary>
                        <p className="mt-2 text-xs text-text-muted">
                          Only territories published by the public provider are listed. Separate
                          routing graphs are not joined across region boundaries.
                        </p>
                        <ul className="mt-2 max-h-[28rem] space-y-1 overflow-y-auto overscroll-contain rounded border border-border-subtle bg-surface-primary p-2">
                          {childMatches.map((region) => (
                            <li key={region.id} className="min-w-0">
                              <button
                                type="button"
                                aria-pressed={selectedRegion?.id === region.id}
                                onClick={() => chooseRegion(group, region.id)}
                                className={`block w-full rounded p-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-desert-green ${selectedRegion?.id === region.id ? 'bg-desert-green/10 font-semibold' : 'hover:bg-surface-secondary'}`}
                              >
                                <span className="block break-words text-text-primary">
                                  {region.name}
                                </span>
                                <span className="block break-words text-xs text-text-muted">
                                  {regionBreadcrumb(regions, region.id)}
                                </span>
                                <span className="mt-1 block text-xs text-text-secondary">
                                  {territoryRouteReady(region, regions)
                                    ? territoryRouteProvider(region)
                                      ? `Covered by ${territoryRouteProvider(region)?.name}`
                                      : 'Ready offline'
                                    : stopped(region)
                                      ? region.components.routing?.status === 'failed'
                                        ? 'Needs attention'
                                        : 'Cancelled'
                                      : busy(region)
                                        ? 'In progress'
                                        : 'Available to install'}
                                </span>
                              </button>
                              {showChildren && region.id !== selectedRegion?.id && (
                                <MapRegionTreeActivity
                                  regions={regionHasOwnActivity(region) ? [region] : []}
                                  ownerId={region.id}
                                  onReveal={() => chooseRegion(group, region.id)}
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                )}
              </li>
            )
          })}
        </ul>
        {query.isPending && (
          <p role="status" className="p-4 text-sm text-text-muted">
            Loading the cached territory catalog…
          </p>
        )}
        {!query.isPending && !visibleGroups.length && (
          <p className="p-4 text-sm text-text-muted">
            No matching countries or published regions. Try another name or filter.
          </p>
        )}
      </nav>
      <details className="mt-4 text-xs text-text-muted">
        <summary className="cursor-pointer">Catalog and update tools</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <StyledButton
            size="sm"
            variant="outline"
            disabled={changing}
            onClick={() => check.mutate(undefined)}
          >
            Check source updates
          </StyledButton>
          <StyledButton
            size="sm"
            variant="outline"
            disabled={changing}
            onClick={() => refresh.mutate()}
          >
            Refresh public catalog
          </StyledButton>
          <StyledButton size="sm" variant="ghost" onClick={() => void invalidate()}>
            Reload local state
          </StyledButton>
        </div>
        <p className="mt-2">
          Installed routes and the cached catalog work offline. Public catalog refreshes and update
          checks need a connection; they never start a download.
        </p>
        {query.data?.updatedAt && (
          <p className="mt-1">Cached catalog: {dateLabel(query.data.updatedAt)}</p>
        )}
      </details>
      <StyledModal
        open={!!confirmation}
        title={
          destructive
            ? 'Remove routing data?'
            : confirmation?.kind === 'update'
              ? 'Update offline routes?'
              : 'Install offline routes?'
        }
        confirmText={
          destructive
            ? 'Remove routing data'
            : confirmation?.kind === 'update'
              ? 'Update routes'
              : 'Install routes'
        }
        confirmVariant={destructive ? 'danger' : 'action'}
        confirmLoading={mutation.isPending}
        confirmDisabled={
          mutation.isPending || (!destructive && actionEstimate?.spaceSufficient === false)
        }
        onClose={() => {
          if (!mutation.isPending) setConfirmation(null)
        }}
        onCancel={() => {
          if (!mutation.isPending) setConfirmation(null)
        }}
        onConfirm={() => {
          if (confirmation) mutation.mutate(confirmation)
        }}
      >
        <p className="text-sm text-text-secondary">
          {confirmation?.kind === 'remove'
            ? `Remove routing data, stopped tasks and unused source files for ${confirmation.region.name}? This also changes availability for regions using that graph. Visual maps and saved pins are preserved.`
            : confirmation?.kind === 'update'
              ? `Obtain and prepare a newer route graph for ${confirmation.region.name}? The installed version stays available until its replacement is verified.`
              : `Install car and walking routes for ${actionRegion?.name || 'this territory'}? NOMAD obtains any missing source, prepares the graph and verifies it automatically. Preparation can take substantial time and temporary disk space.`}
        </p>
        {actionRegion && !destructive && (
          <MapRegionDownloadEstimate
            regionId={actionRegion.id}
            components={['routing']}
            operation={confirmation?.kind === 'update' ? 'update' : 'install'}
            onEstimate={rememberEstimate}
          />
        )}
        {mutation.error && (
          <p role="alert" className="mt-2 text-xs text-desert-red">
            {mapApiErrorMessage(mutation.error, 'The routing operation could not be started.')}
          </p>
        )}
      </StyledModal>
    </section>
  )
}
