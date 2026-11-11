import { mapRegionId, mapRegionComponent, MapRegionError } from './map_region_catalog.js'

/** A retry has a separate queue identity even while the previous job exits. */
export function mapRegionJobId(regionId: string, component: string, operationId?: string) {
  if (operationId && !/^[a-f0-9-]{36}$/.test(operationId))
    throw new MapRegionError('Invalid region operation identity')
  return (
    `region-${mapRegionId(regionId)}-${mapRegionComponent(component)}` +
    (operationId ? '-' + operationId : '')
  )
}
