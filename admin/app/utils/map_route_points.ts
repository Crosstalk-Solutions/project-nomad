import { parseMapPoint } from './map_route_link.js'

export type RoutePoint = { lat: number; lon: number }
export type RouteStop = {
  id: string
  value: string
  query?: string
  label?: string
  precision?: string
  source?: string
}
export type RoutePickMode = string | null
export type RouteManeuver = {
  instruction: string
  distanceMeters: number
  durationSeconds: number
}
export type RouteLeg = {
  fromIndex: number
  toIndex: number
  distanceMeters: number
  durationSeconds: number
  maneuvers: RouteManeuver[]
}
export type OfflineRouteResult = {
  regionName?: string
  packageId: string
  packageVersion: string
  profile: 'auto' | 'pedestrian'
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distanceMeters: number
  durationSeconds: number
  maneuvers: RouteManeuver[]
  legs: RouteLeg[]
}

export const MAX_ROUTE_POINTS = 7
export const ROUTE_INSTRUCTIONS_PAGE_SIZE = 10

export function createRouteStops(origin = '', destination = '', vias: string[] = []): RouteStop[] {
  return [origin, ...vias.slice(0, MAX_ROUTE_POINTS - 2), destination].map((value, index) => ({
    id: `route-${index}`,
    value,
  }))
}

export function routePointLabel(index: number, count: number) {
  const role = index === 0 ? 'Origin' : index === count - 1 ? 'Destination' : `Stop ${index}`
  return `${String.fromCharCode(65 + index)} · ${role}`
}

/** Move whole cards, preserving the active card ID and its address-search state. */
export function moveRouteStop(stops: RouteStop[], fromIndex: number, toIndex: number): RouteStop[] {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= stops.length ||
    toIndex < 0 ||
    toIndex >= stops.length ||
    fromIndex === toIndex
  )
    return stops
  const result = [...stops]
  const [stop] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, stop)
  return result
}

export function routeDistanceLabel(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`
}

export function routeDurationLabel(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

const validAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

function validManeuvers(value: unknown): value is RouteManeuver[] {
  return (
    Array.isArray(value) &&
    value.every(
      (step) =>
        step &&
        typeof step.instruction === 'string' &&
        validAmount(step.distanceMeters) &&
        validAmount(step.durationSeconds)
    )
  )
}

/** Reject partial/mismatched legs rather than showing instructions for a different itinerary. */
export function isOfflineRouteResult(
  result: unknown,
  pointCount: number,
  profile: 'auto' | 'pedestrian'
): result is OfflineRouteResult {
  if (!result || typeof result !== 'object' || pointCount < 2 || pointCount > MAX_ROUTE_POINTS)
    return false
  const value = result as OfflineRouteResult
  return (
    typeof value.packageId === 'string' &&
    typeof value.packageVersion === 'string' &&
    (value.regionName === undefined || typeof value.regionName === 'string') &&
    value.profile === profile &&
    value.geometry?.type === 'LineString' &&
    Array.isArray(value.geometry.coordinates) &&
    value.geometry.coordinates.length >= 2 &&
    value.geometry.coordinates.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 180 &&
        Math.abs(point[1]) <= 90
    ) &&
    validAmount(value.distanceMeters) &&
    validAmount(value.durationSeconds) &&
    validManeuvers(value.maneuvers) &&
    Array.isArray(value.legs) &&
    value.legs.length === pointCount - 1 &&
    value.legs.every(
      (leg, index) =>
        leg &&
        leg.fromIndex === index &&
        leg.toIndex === index + 1 &&
        validAmount(leg.distanceMeters) &&
        validAmount(leg.durationSeconds) &&
        validManeuvers(leg.maneuvers)
    )
  )
}

export function routeInstructionsText(route: OfflineRouteResult, stops: RouteStop[]) {
  const lines = [
    'PROJECT NOMAD — OFFLINE ROUTE',
    `Travel mode: ${route.profile === 'auto' ? 'Car' : 'Walking'}`,
    `Data: ${route.regionName || route.packageId}`,
    `Dataset: ${route.packageId} / ${route.packageVersion}`,
    `Total: ${routeDistanceLabel(route.distanceMeters)} · ${routeDurationLabel(route.durationSeconds)}`,
    '',
    'Time is estimated from the downloaded road network. Live traffic and temporary road closures are unavailable offline.',
    '',
    ...stops.map(
      (stop, index) =>
        `${routePointLabel(index, stops.length)}: ${stop.label ? `${stop.label} (${stop.value})` : stop.value}`
    ),
  ]
  for (const leg of route.legs) {
    lines.push(
      '',
      `LEG ${leg.fromIndex + 1}: ${routePointLabel(leg.fromIndex, stops.length)} → ${routePointLabel(leg.toIndex, stops.length)}`,
      `${routeDistanceLabel(leg.distanceMeters)} · ${routeDurationLabel(leg.durationSeconds)}`,
      ...leg.maneuvers.map(
        (step, index) =>
          `${index + 1}. ${step.instruction} (${routeDistanceLabel(step.distanceMeters)} · ${routeDurationLabel(step.durationSeconds)})`
      )
    )
  }
  return lines.join('\n') + '\n'
}

export function parsedRouteStops(stops: RouteStop[]) {
  return stops.map((stop) => parseMapPoint(stop.value))
}
