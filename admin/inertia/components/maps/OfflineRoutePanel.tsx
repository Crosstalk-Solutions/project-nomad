import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconChevronDown, IconChevronUp, IconRoute } from '@tabler/icons-react'
import StyledButton from '~/components/StyledButton'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import { mapApiErrorMessage } from '~/lib/map_api_error'
import { getRoutingCoverage } from '~/lib/map_regions_api'
import { getMapRoutingSettings, MAP_ROUTING_SETTINGS_KEY } from '~/lib/map_routing_settings_api'
import OfflineRoutePoints from './OfflineRoutePoints'
import OfflineRouteInstructions from './OfflineRouteInstructions'
import { parseMapPoint, type MapRouteLink } from '../../../app/utils/map_route_link'
import {
  createRouteStops,
  isOfflineRouteResult,
  MAX_ROUTE_POINTS,
  parsedRouteStops,
  routeDistanceLabel as distanceLabel,
  routeDurationLabel as durationLabel,
  routePointLabel,
  type OfflineRouteResult,
  type RoutePickMode,
  type RoutePoint,
  type RouteStop,
} from '../../../app/utils/map_route_points'

export type {
  OfflineRouteResult,
  RoutePickMode,
  RoutePoint,
  RouteStop,
} from '../../../app/utils/map_route_points'

export const parseRoutePoint = parseMapPoint

const insideCoverage = (point: RoutePoint, [west, south, east, north]: number[]) =>
  point.lat >= south &&
  point.lat <= north &&
  (west <= east ? point.lon >= west && point.lon <= east : point.lon >= west || point.lon <= east)

type OfflineRoutePanelProps = {
  stops: RouteStop[]
  onStopsChange: (value: RouteStop[]) => void
  picking: RoutePickMode
  onPickingChange: (value: RoutePickMode) => void
  route: OfflineRouteResult | null
  onRouteChange: (value: OfflineRouteResult | null) => void
  onFocusCoverage: (bounds: [number, number, number, number]) => void
  onOpenChange?: (value: boolean) => void
  initialLink?: MapRouteLink
}

export default function OfflineRoutePanel({
  stops,
  onStopsChange,
  picking,
  onPickingChange,
  route,
  onRouteChange,
  onFocusCoverage,
  onOpenChange,
  initialLink,
}: OfflineRoutePanelProps) {
  const [open, setOpen] = useState(() => window.innerWidth >= 768)
  const [useSavedRegion, setUseSavedRegion] = useState(false)
  const [profile, setProfile] = useState<'auto' | 'pedestrian'>(initialLink?.profile || 'auto')
  const [pinnedVersion, setPinnedVersion] = useState(initialLink?.packageVersion || '')
  const [ignoreLinkError, setIgnoreLinkError] = useState(false)
  const autorouteHandled = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const {
    data,
    isPending,
    error: packagesError,
    refetch,
  } = useQuery({
    queryKey: ['routing-coverage'],
    queryFn: getRoutingCoverage,
    refetchInterval: 15000,
  })
  const linkRegionId = useSavedRegion ? '' : initialLink?.regionId || ''
  const settings = useQuery({
    queryKey: MAP_ROUTING_SETTINGS_KEY,
    queryFn: ({ signal }) => getMapRoutingSettings(signal),
    enabled: !linkRegionId,
    refetchInterval: linkRegionId ? false : 15000,
  })
  const settingsReady = !!linkRegionId || !!settings.data

  const installedPackages = data?.regions ?? []
  const selectedId = linkRegionId || (settings.data?.mode === 'fixed' ? settings.data.regionId : '')
  const selectedPackage = installedPackages.find((pack) => pack.id === selectedId)
  // The listed manifest describes the active graph, which can be older than
  // the most recently installed version until the user activates that update.
  const selectedVersion = selectedPackage?.version
  const profiles = selectedPackage?.profiles ?? (['auto', 'pedestrian'] as const)
  const locations = parsedRouteStops(stops)
  const stopsKey = JSON.stringify(stops)
  const requestKey = JSON.stringify([stopsKey, selectedId, selectedVersion, profile, pinnedVersion])
  const latestRequestKey = useRef(requestKey)
  latestRequestKey.current = requestKey
  const pickingIndex = stops.findIndex((stop) => stop.id === picking)
  const pickingLabel = pickingIndex >= 0 ? routePointLabel(pickingIndex, stops.length) : ''
  const outsideCoverage =
    !!selectedPackage &&
    locations.some((point) => point && !insideCoverage(point, selectedPackage.coverage.bbox))
  const linkUnavailable =
    (!ignoreLinkError && !!initialLink?.error) ||
    !!(selectedId && data && !selectedPackage) ||
    !!(pinnedVersion && selectedVersion && pinnedVersion !== selectedVersion)
  const linkError =
    (!ignoreLinkError && initialLink?.error) ||
    (selectedId && data && !selectedPackage
      ? linkRegionId
        ? 'The routing region requested by this link is not installed. Open Routing settings or explicitly use the saved preference.'
        : 'The fixed routing region is no longer installed. Choose another region or automatic routing in Map Settings.'
      : pinnedVersion && selectedVersion && pinnedVersion !== selectedVersion
        ? 'The exact routing version requested by this link is not installed. Clear the version pin to use the current data.'
        : null)
  const canRoute =
    stops.length >= 2 &&
    stops.length <= MAX_ROUTE_POINTS &&
    locations.every((point) => point !== null) &&
    installedPackages.length > 0 &&
    data?.routerReady &&
    profiles.includes(profile) &&
    !outsideCoverage &&
    !linkUnavailable &&
    settingsReady &&
    (!!linkRegionId || !settings.isError)

  useEffect(() => onOpenChange?.(open), [open, onOpenChange])

  useEffect(() => {
    const controls = controlsRef.current
    const summary = summaryRef.current
    if (route && open && controls && summary) {
      controls.scrollTo({
        top: Math.max(
          0,
          controls.scrollTop +
            summary.getBoundingClientRect().top -
            controls.getBoundingClientRect().top -
            12
        ),
        behavior: 'smooth',
      })
    }
  }, [route, open])

  useEffect(() => {
    requestRef.current?.abort()
    setLoading(false)
    setError(null)
    onRouteChange(null)
  }, [requestKey, onRouteChange])

  useEffect(() => () => requestRef.current?.abort(), [])

  const invalidateRequest = () => {
    requestRef.current?.abort()
    requestRef.current = null
    setLoading(false)
    setError(null)
    onRouteChange(null)
  }

  const changeStops = (next: RouteStop[]) => {
    autorouteHandled.current = true
    invalidateRequest()
    onStopsChange(next)
  }

  const calculateRoute = async () => {
    if (!canRoute) return
    requestRef.current?.abort()
    const controller = new AbortController()
    const startedKey = requestKey
    requestRef.current = controller
    setError(null)
    setLoading(true)
    onPickingChange(null)
    onRouteChange(null)
    try {
      const response = await fetch('/api/maps/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          automatic: true,
          regionId: linkRegionId || undefined,
          packageVersion: pinnedVersion || undefined,
          profile,
          locations,
        }),
      })
      const result = await response.json().catch(() => {
        throw new Error('The routing service returned an unreadable response. Please try again.')
      })
      if (!response.ok)
        throw new Error(result?.message || 'The offline route could not be calculated.')
      if (!isOfflineRouteResult(result, stops.length, profile)) {
        throw new Error('The routing service returned an invalid route. Please try again.')
      }
      if (
        controller.signal.aborted ||
        latestRequestKey.current !== startedKey ||
        requestRef.current !== controller
      )
        return
      onRouteChange(result as OfflineRouteResult)
      if (window.innerWidth < 768) setOpen(false)
    } catch (cause) {
      if (
        !controller.signal.aborted &&
        latestRequestKey.current === startedKey &&
        requestRef.current === controller
      )
        setError(mapApiErrorMessage(cause, 'The offline route could not be calculated.'))
    } finally {
      if (
        !controller.signal.aborted &&
        latestRequestKey.current === startedKey &&
        requestRef.current === controller
      )
        setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialLink?.autoroute || autorouteHandled.current || !canRoute) return
    autorouteHandled.current = true
    void calculateRoute()
  }, [initialLink, canRoute])

  return (
    <section
      className={`${open ? 'w-[min(22rem,calc(100vw-2rem))]' : 'w-48 max-w-[calc(100vw-8rem)] md:w-[22rem] md:max-w-none'} overflow-hidden rounded-lg border border-border-default bg-surface-primary/95 shadow-lg backdrop-blur-sm`}
      aria-label="Offline routes"
    >
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value)
          onPickingChange(null)
        }}
        aria-expanded={open}
        aria-controls="offline-route-controls"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-text-primary hover:bg-surface-secondary"
      >
        <span className="flex min-w-0 items-center gap-2">
          <IconRoute size={18} className="shrink-0 text-desert-orange" />
          <span className="truncate">
            {!open && picking
              ? `Choose ${pickingLabel}`
              : !open && route
                ? `${distanceLabel(route.distanceMeters)} · ${durationLabel(route.durationSeconds)}`
                : 'Offline routes'}
          </span>
        </span>
        {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
      </button>
      <div
        id="offline-route-controls"
        ref={controlsRef}
        hidden={!open}
        className="max-h-[calc(100dvh-15rem)] space-y-3 overflow-y-auto border-t border-border-subtle p-3 md:max-h-[calc(100dvh-10rem)]"
      >
        <StyledSectionHeader title="Plan a route" level={2} className="!mb-2 !text-lg" />
        {linkError && (
          <p role="alert" className="text-sm text-desert-red">
            {linkError}
            {initialLink?.error && !ignoreLinkError && (
              <button
                className="ml-1 underline"
                onClick={() => {
                  autorouteHandled.current = true
                  setIgnoreLinkError(true)
                }}
              >
                Ignore invalid link
              </button>
            )}
            {linkRegionId && (
              <button
                className="ml-1 underline"
                onClick={() => {
                  autorouteHandled.current = true
                  setUseSavedRegion(true)
                  setPinnedVersion('')
                }}
              >
                Use saved routing preference
              </button>
            )}
          </p>
        )}
        {pinnedVersion && (
          <p className="text-xs text-text-secondary">
            Requested version: {pinnedVersion}{' '}
            <button className="underline text-desert-green" onClick={() => setPinnedVersion('')}>
              Use current version
            </button>
          </p>
        )}
        {selectedPackage && !profiles.includes(profile) && (
          <p role="alert" className="text-sm text-desert-red">
            The selected travel mode is unavailable in this routing region. Choose an available mode
            explicitly.
          </p>
        )}
        <p className="text-xs text-text-secondary">
          Enter coordinates, click the map or choose a saved pin. Routing data is selected using
          your Map Settings preference.
        </p>
        {!linkRegionId && settings.isError && (
          <p role="alert" className="text-sm text-desert-red">
            {mapApiErrorMessage(
              settings.error,
              'Routing settings could not be loaded. Open Map Settings to review the saved preference.'
            )}
          </p>
        )}
        {isPending || (!linkRegionId && settings.isPending) ? (
          <p role="status" className="text-sm text-text-secondary">
            Loading routing data…
          </p>
        ) : packagesError ? (
          <div role="alert" className="space-y-2 text-sm text-desert-red">
            <p>{mapApiErrorMessage(packagesError, 'Unable to load routing regions.')}</p>
            <StyledButton variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </StyledButton>
          </div>
        ) : installedPackages.length === 0 ? (
          <p
            role="status"
            className="rounded border border-border-default bg-surface-secondary p-3 text-sm text-text-secondary"
          >
            No routing region is installed. Download a routing component in Map Settings to enable
            offline routes.
          </p>
        ) : (
          <>
            {!data?.routerReady ? (
              <p role="status" className="text-sm text-text-secondary">
                The routing service is not ready. Check Map Settings, then try again.
              </p>
            ) : null}
            <OfflineRoutePoints
              stops={stops}
              picking={picking}
              onChange={changeStops}
              onPickingChange={onPickingChange}
              onUserAction={() => {
                autorouteHandled.current = true
              }}
              onCalculate={() => void calculateRoute()}
              onFocusCoverage={onFocusCoverage}
              onChooseMap={() => {
                if (window.innerWidth < 768) setOpen(false)
              }}
            />
            {picking && (
              <p
                id="route-map-selection"
                role="status"
                className="rounded border border-border-default bg-surface-secondary p-2 text-sm text-text-primary"
              >
                Click the map or a saved pin to set {pickingLabel}. This field stays selected for
                adjustments. Press Escape to cancel.
              </p>
            )}
            {outsideCoverage && (
              <p role="alert" className="text-sm text-desert-red">
                All points must be inside the fixed routing region. Choose another point or review
                the region in Map Settings.
              </p>
            )}
            <div>
              <label
                htmlFor="route-profile"
                className="block text-sm font-medium text-text-primary"
              >
                Travel mode:
              </label>
              <select
                id="route-profile"
                value={profile}
                onChange={(event) => {
                  autorouteHandled.current = true
                  invalidateRequest()
                  setProfile(event.target.value as 'auto' | 'pedestrian')
                }}
                className="mt-1 w-full rounded-md border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
              >
                {!profiles.includes(profile) && (
                  <option value={profile}>
                    {profile === 'auto' ? 'Car' : 'Walking'} (unavailable)
                  </option>
                )}
                {profiles.map((available) => (
                  <option key={available} value={available}>
                    {available === 'auto' ? 'Car' : 'Walking'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <StyledButton
                icon="IconMap"
                size="sm"
                disabled={!canRoute}
                loading={loading}
                onClick={() => void calculateRoute()}
              >
                Calculate route
              </StyledButton>
              <StyledButton
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => {
                  autorouteHandled.current = true
                  changeStops([...stops].reverse())
                }}
              >
                Reverse
              </StyledButton>
              <StyledButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  autorouteHandled.current = true
                  changeStops(createRouteStops())
                  onPickingChange(null)
                  onRouteChange(null)
                }}
              >
                Clear
              </StyledButton>
            </div>
          </>
        )}
        {loading && (
          <p role="status" className="text-sm text-text-secondary">
            Calculating offline route…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-desert-red">
            {error}
          </p>
        )}
        {route && (
          <div
            ref={summaryRef}
            className="space-y-2 border-t border-border-subtle pt-3"
            aria-live="polite"
          >
            <p className="text-lg font-semibold text-text-primary">
              {distanceLabel(route.distanceMeters)} · {durationLabel(route.durationSeconds)}
            </p>
            <p className="text-xs text-text-secondary">
              {route.regionName && (
                <span className="mb-1 block">Data used: {route.regionName}</span>
              )}
              Time is estimated from the downloaded road network. Live traffic and temporary road
              closures are unavailable offline.
            </p>
            <OfflineRouteInstructions route={route} stops={stops} />
          </div>
        )}
      </div>
    </section>
  )
}
