import axios from 'axios'
import type {
  MapRegionsState,
  MapRegionComponent,
  MapRegionUpdateState,
} from '../../types/map_regions'
export const MAP_REGIONS_KEY = ['offline-map-regions'] as const
export const MAP_OPERATIONS_KEY = ['offline-map-operations'] as const
export interface MapRegionOperationRegion {
  regionId: string
  name: string
  components: Partial<
    Record<MapRegionComponent, import('../../types/map_regions').MapRegionComponentState>
  >
}
export async function getMapOperations(): Promise<{
  operations: MapRegionOperationRegion[]
  observedAt: string
  builderReady?: boolean
  searchBuilderReady?: boolean
}> {
  return (await axios.get('/api/maps/operations')).data
}
export async function getMapRegions(): Promise<MapRegionsState> {
  return (await axios.get('/api/maps/regions/catalog')).data
}
export async function installMapRegion(regionId: string, components: MapRegionComponent[]) {
  return (await axios.post('/api/maps/regions/install', { regionId, components })).data
}
export async function removeMapRegion(regionId: string, component: MapRegionComponent) {
  return (await axios.delete(`/api/maps/regions/${encodeURIComponent(regionId)}/${component}`)).data
}
export interface MapRegionUpdateCheck {
  checked: number
  results: { regionId: string; component: MapRegionComponent; update: MapRegionUpdateState }[]
}
export async function checkMapRegionUpdates(regionId?: string): Promise<MapRegionUpdateCheck> {
  return (await axios.post('/api/maps/regions/check-updates', regionId ? { regionId } : {})).data
}
export async function updateMapRegion(regionId: string, components: MapRegionComponent[]) {
  return (await axios.post('/api/maps/regions/update', { regionId, components })).data
}
export async function refreshMapRegionCatalog(): Promise<{
  success: boolean
  regions: number
  updatedAt?: string
}> {
  return (await axios.post('/api/maps/regions/refresh-catalog')).data
}
export async function cancelMapRegion(regionId: string, components?: MapRegionComponent[]) {
  return (await axios.post('/api/maps/regions/cancel', { regionId, components })).data
}
export async function retryMapRegion(regionId: string, components?: MapRegionComponent[]) {
  return (await axios.post('/api/maps/regions/retry', { regionId, components })).data
}
export interface MapRegionEstimate {
  regionId: string
  totalSourceBytes?: number
  remainingDownloadBytes?: number
  reusableBytes?: number
  minimumFreeBytes?: number
  availableFreeBytes?: number
  spaceSufficient?: boolean
  diskCheckError?: string
  complete: boolean
  checkedAt?: string
  message?: string
  collection?: boolean
  packages?: number
  sources: {
    url: string
    bytes?: number
    cachedBytes?: number
    status: 'known' | 'unknown'
    checkedAt?: string
  }[]
}
export async function getMapRegionEstimate(
  regionId: string,
  components: MapRegionComponent[],
  operation: 'install' | 'update' = 'install',
  signal?: AbortSignal
): Promise<MapRegionEstimate> {
  return (
    await axios.get(`/api/maps/regions/${encodeURIComponent(regionId)}/estimate`, {
      params: { components: components.join(','), operation },
      signal,
    })
  ).data
}
export interface RoutingCoverage {
  id: string
  packageId: string
  version: string
  name: string
  coverage: { bbox: [number, number, number, number] }
  profiles: ('auto' | 'pedestrian')[]
  namespace: 'packs' | 'regions'
}
export async function getRoutingCoverage(): Promise<{
  regions: RoutingCoverage[]
  routerReady: boolean
}> {
  return (await axios.get('/api/maps/routing/coverage')).data
}
