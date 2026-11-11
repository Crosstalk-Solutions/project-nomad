import { MapPackService } from '#services/map_pack_service'
import { MapRegionService } from '#services/map_region_service'
import { MapRoutingSettingsService } from '#services/map_routing_settings_service'
import {
  OfflineRouteError,
  formatValhallaRoute,
  validateOfflineRoute,
  validateRouteLocations,
  offlineRouteEngineError,
} from '../utils/offline_route.js'
import { regionContains } from '../utils/map_region_coverage.js'
import type { MapRegionCoverage } from '../../types/map_regions.js'
import {
  isInstallableTerritory,
  mapPackTerritory,
  mapRegionTerritory,
  type MapRegionTerritory,
} from '../utils/map_region_territory.js'

interface RoutingRegion extends MapRegionTerritory {
  id: string
  packageId: string
  version: string
  name: string
  coverage: MapRegionCoverage
  profiles: ('auto' | 'pedestrian')[]
  namespace: 'packs' | 'regions'
}
export class OfflineRouteService {
  async inventory() {
    const regions: RoutingRegion[] = []
    for (const pack of await new MapPackService().listInstalled()) {
      const territory = mapPackTerritory(pack)
      if (isInstallableTerritory(territory))
        regions.push({
          ...territory,
          id: 'packs:' + pack.id,
          packageId: pack.id,
          version: pack.version,
          name: `${pack.name} — imported (${pack.version})`,
          coverage: pack.coverage,
          profiles: pack.routing.profiles,
          namespace: 'packs',
        })
    }
    for (const region of await new MapRegionService().listInstalledComponents('routing')) {
      if (!isInstallableTerritory(region)) continue
      regions.push({
        ...mapRegionTerritory(region),
        id: 'regions:' + region.regionId,
        packageId: region.regionId,
        version: region.version,
        name: region.regionId === 'brazil' ? 'Brazil' : region.name,
        coverage: region.coverage,
        profiles: ['auto', 'pedestrian'],
        namespace: 'regions',
      })
    }
    let routerReady = false
    try {
      const response = await fetch((process.env.MAP_ROUTER_URL || '') + '/status', {
        signal: AbortSignal.timeout(2000),
      })
      const value = (await response.json()) as { ready?: boolean }
      routerReady = response.ok && value.ready === true
    } catch {}
    return { regions, routerReady }
  }
  private async calculate(
    route: {
      packageId: string
      packageVersion: string
      profile: 'auto' | 'pedestrian'
      locations: { lat: number; lon: number }[]
    },
    namespace: 'packs' | 'regions' = 'packs'
  ) {
    const broker = process.env.MAP_ROUTER_URL
    if (!broker)
      throw new OfflineRouteError(
        'The offline navigation engine is not configured.',
        503,
        'ENGINE_UNAVAILABLE'
      )
    let response: Response
    try {
      response = await fetch(`${broker.replace(/\/$/, '')}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: route.packageId,
          packageVersion: route.packageVersion,
          namespace,
          request: {
            locations: route.locations,
            costing: route.profile,
            units: 'kilometers',
            language: 'en-US',
            shape_format: 'polyline6',
          },
        }),
        signal: AbortSignal.timeout(120000),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
        throw new OfflineRouteError(
          'The offline route calculation timed out. Retry or calculate shorter sections.',
          504,
          'ENGINE_TIMEOUT'
        )
      throw new OfflineRouteError(
        'The offline navigation engine is unavailable. Check Map Settings.',
        503,
        'ENGINE_UNAVAILABLE'
      )
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw offlineRouteEngineError(response.status, payload, route.profile)
    return formatValhallaRoute(payload, route)
  }
  async route(value: unknown) {
    const body = value as Record<string, unknown> | null
    if (body?.automatic !== true) {
      const active = await new MapPackService().getActivePackage()
      if (active && !isInstallableTerritory(mapPackTerritory(active)))
        throw new OfflineRouteError(
          'Choose an installed country or subregion. An imported graph needs single-country territory metadata in its installed manifest.',
          409
        )
      return this.calculate(validateOfflineRoute(value, active))
    }
    if (body.profile !== 'auto' && body.profile !== 'pedestrian')
      throw new OfflineRouteError('Choose car or walking.')
    const locations = validateRouteLocations(body.locations)
    const inventory = await this.inventory()
    if (
      body.regionId !== undefined &&
      (typeof body.regionId !== 'string' ||
        !/^(packs|regions):[a-z0-9][a-z0-9_-]{0,119}$/.test(body.regionId))
    )
      throw new OfflineRouteError('Invalid routing region.')
    if (
      body.packageVersion !== undefined &&
      (typeof body.packageVersion !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(body.packageVersion) ||
        !body.regionId)
    )
      throw new OfflineRouteError('A routing version pin requires a valid routing region.')
    const settings =
      body.regionId === undefined ? await new MapRoutingSettingsService().read() : undefined
    const selectedId = body.regionId ?? (settings?.mode === 'fixed' ? settings.regionId : undefined)
    const selected = inventory.regions.find((region) => region.id === selectedId)
    if (selected && !isInstallableTerritory(selected))
      throw new OfflineRouteError(
        'Choose an installed country or official subregion. Continental and multi-country graphs are unavailable for routing.',
        409
      )
    if (
      selectedId &&
      !inventory.regions.some(
        (r) => r.id === selectedId && (!body.packageVersion || r.version === body.packageVersion)
      )
    )
      throw new OfflineRouteError(
        settings?.mode === 'fixed'
          ? 'The fixed routing region is no longer installed. Choose another region or automatic routing in Map Settings.'
          : 'The requested routing region or version is not installed. Select an available version explicitly.',
        409
      )
    const candidates = inventory.regions.filter(
      (r) =>
        isInstallableTerritory(r) &&
        (!selectedId || selectedId === r.id) &&
        (!body.packageVersion || body.packageVersion === r.version) &&
        r.profiles.includes(body.profile as 'auto' | 'pedestrian') &&
        locations.every((p) => regionContains(r.coverage, p))
    )
    candidates.sort((a, b) => {
      const area = (r: RoutingRegion) =>
        (r.coverage.bbox[2] - r.coverage.bbox[0]) * (r.coverage.bbox[3] - r.coverage.bbox[1])
      return Number(a.namespace === 'packs') - Number(b.namespace === 'packs') || area(a) - area(b)
    })
    if (!candidates.length)
      throw new OfflineRouteError(
        'No installed country or subregion covers every selected point. Choose one routing package covering the whole journey; separate country graphs are not joined automatically.',
        422,
        'OUTSIDE_COVERAGE'
      )
    let lastPathError: OfflineRouteError | undefined
    for (const candidate of candidates) {
      try {
        const result = await this.calculate(
          {
            packageId: candidate.packageId,
            packageVersion: candidate.version,
            profile: body.profile,
            locations,
          },
          candidate.namespace
        )
        return { ...result, regionId: candidate.id, regionName: candidate.name }
      } catch (error) {
        if (
          !(error instanceof OfflineRouteError) ||
          !['NO_PATH', 'UNCONNECTED_POINTS', 'NO_ROUTABLE_EDGE'].includes(error.code)
        )
          throw error
        lastPathError = error
      }
    }
    // A graph covered the selected points. Keep its actual path/access error;
    // downloading the same coverage cannot resolve a distance limit or timeout.
    throw lastPathError!
  }
}
