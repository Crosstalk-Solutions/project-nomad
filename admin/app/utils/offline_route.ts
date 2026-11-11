import type { MapPackManifest, MapPackProfile } from '../../types/map_packs.js'

export const offlineRouteErrorCodes = [
  'INVALID_ROUTE_REQUEST',
  'OUTSIDE_COVERAGE',
  'DISTANCE_LIMIT_EXCEEDED',
  'NO_PATH',
  'UNCONNECTED_POINTS',
  'NO_ROUTABLE_EDGE',
  'ENGINE_BUSY',
  'ENGINE_TIMEOUT',
  'ENGINE_UNAVAILABLE',
  'ENGINE_REJECTED',
  'ENGINE_INVALID_RESPONSE',
] as const
export type OfflineRouteErrorCode = (typeof offlineRouteErrorCodes)[number]

export class OfflineRouteError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code: OfflineRouteErrorCode = status >= 500
      ? 'ENGINE_INVALID_RESPONSE'
      : 'INVALID_ROUTE_REQUEST',
    public engineCode?: number,
    public distanceLimitMeters?: number
  ) {
    super(message)
    this.name = 'OfflineRouteError'
  }
}

/** Retain known engine causes without displaying arbitrary upstream error text. */
export function offlineRouteEngineError(
  status: number,
  payload: unknown,
  profile: 'auto' | 'pedestrian'
): OfflineRouteError {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const engine =
    body.engine && typeof body.engine === 'object' ? (body.engine as Record<string, unknown>) : {}
  const engineCode =
    typeof engine.error_code === 'number' &&
    Number.isInteger(engine.error_code) &&
    engine.error_code >= 0 &&
    engine.error_code < 10000
      ? engine.error_code
      : undefined
  const mode = profile === 'pedestrian' ? 'walking' : 'car'
  if (engineCode === 154) {
    const match =
      typeof engine.error === 'string'
        ? /max distance limit:\s*(\d+(?:\.\d+)?)\s*meters/i.exec(engine.error)
        : null
    const limit = match ? Number(match[1]) : undefined
    const distanceLimitMeters = limit && Number.isFinite(limit) ? limit : undefined
    const label = distanceLimitMeters ? ` (${distanceLimitMeters / 1000} km)` : ''
    return new OfflineRouteError(
      `This ${mode} route exceeds the navigation engine's distance limit${label}. Calculate shorter sections separately.`,
      422,
      'DISTANCE_LIMIT_EXCEEDED',
      engineCode,
      distanceLimitMeters
    )
  }
  if (engineCode === 170)
    return new OfflineRouteError(
      `The selected points are not connected for ${mode} travel in this graph. Choose different points or check access for this travel mode.`,
      422,
      'UNCONNECTED_POINTS',
      engineCode
    )
  if (engineCode === 171)
    return new OfflineRouteError(
      `No usable ${mode} path was found near one or more selected points. Choose a nearby road or path.`,
      422,
      'NO_ROUTABLE_EDGE',
      engineCode
    )
  if (engineCode === 442)
    return new OfflineRouteError(
      `No connected ${mode} route was found in this graph. Check access for this travel mode or choose different points.`,
      422,
      'NO_PATH',
      engineCode
    )
  if (body.code === 'ENGINE_BUSY')
    return new OfflineRouteError(
      'The offline navigation engine is busy. Please retry shortly.',
      503,
      'ENGINE_BUSY'
    )
  if (body.code === 'ENGINE_TIMEOUT' || status === 504)
    return new OfflineRouteError(
      'The offline route calculation timed out. Retry or calculate shorter sections.',
      504,
      'ENGINE_TIMEOUT'
    )
  if (body.code === 'ENGINE_INVALID_RESPONSE')
    return new OfflineRouteError(
      'The offline navigation engine returned an invalid response. Please retry.',
      502,
      'ENGINE_INVALID_RESPONSE'
    )
  if ([400, 404, 422].includes(status))
    return new OfflineRouteError(
      'The navigation engine rejected this route. Check the selected points and travel mode.',
      422,
      'ENGINE_REJECTED',
      engineCode
    )
  return new OfflineRouteError(
    'The offline navigation engine is unavailable. Check Map Settings.',
    503,
    'ENGINE_UNAVAILABLE',
    engineCode
  )
}

export interface OfflineRouteRequest {
  packageId: string
  packageVersion: string
  profile: MapPackProfile
  locations: { lat: number; lon: number }[]
}

/** Ordered stops, including the origin and final destination. */
export function validateRouteLocations(value: unknown): OfflineRouteRequest['locations'] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 7) {
    throw new OfflineRouteError(
      'Choose an origin and up to six destinations (2 to 7 points, A to G).'
    )
  }
  return value.map((point: unknown) => {
    if (!point || typeof point !== 'object') throw new OfflineRouteError('Invalid coordinates.')
    const { lat, lon } = point as Record<string, unknown>
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      throw new OfflineRouteError('Invalid coordinates.')
    return { lat, lon }
  })
}

export function validateOfflineRoute(
  value: unknown,
  active: MapPackManifest | null
): OfflineRouteRequest {
  if (!active)
    throw new OfflineRouteError(
      'Activate an offline navigation package in Map Settings first.',
      409
    )
  if (!value || typeof value !== 'object') throw new OfflineRouteError('Invalid route request.')
  const body = value as Record<string, unknown>
  if (body.packageId !== active.id || body.packageVersion !== active.version) {
    throw new OfflineRouteError(
      'The active package changed. Refresh the navigation panel and try again.',
      409
    )
  }
  if (
    (body.profile !== 'auto' && body.profile !== 'pedestrian') ||
    !active.routing.profiles.includes(body.profile)
  ) {
    throw new OfflineRouteError('This travel mode is not available in the active package.')
  }
  const [west, south, east, north] = active.coverage.bbox
  const locations = validateRouteLocations(body.locations)
  for (const { lat, lon } of locations) {
    if (lon < west || lon > east || lat < south || lat > north) {
      throw new OfflineRouteError(
        'All points must be inside the active navigation package coverage.',
        422,
        'OUTSIDE_COVERAGE'
      )
    }
  }
  return { packageId: active.id, packageVersion: active.version, profile: body.profile, locations }
}

/** Valhalla encodes longitude/latitude deltas with six decimal places. */
export function decodePolyline6(encoded: string): [number, number][] {
  let index = 0
  let latitude = 0
  let longitude = 0
  const coordinates: [number, number][] = []
  const delta = () => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      if (index >= encoded.length || shift > 30)
        throw new OfflineRouteError('Invalid route geometry from navigation engine.', 502)
      byte = encoded.charCodeAt(index++) - 63
      if (byte < 0 || byte > 63)
        throw new OfflineRouteError('Invalid route geometry from navigation engine.', 502)
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < encoded.length) {
    latitude += delta()
    longitude += delta()
    const point: [number, number] = [longitude / 1e6, latitude / 1e6]
    if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)
      throw new OfflineRouteError('Invalid route geometry from navigation engine.', 502)
    coordinates.push(point)
  }
  if (coordinates.length < 2)
    throw new OfflineRouteError('Navigation engine returned no road route.', 422)
  return coordinates
}

export function formatValhallaRoute(payload: any, request: OfflineRouteRequest) {
  const trip = payload?.trip
  if (
    !trip ||
    trip.status !== 0 ||
    !Array.isArray(trip.legs) ||
    !trip.legs.length ||
    !Number.isFinite(trip.summary?.length) ||
    !Number.isFinite(trip.summary?.time) ||
    trip.summary.length < 0 ||
    trip.summary.time < 0
  ) {
    throw new OfflineRouteError(
      'No road route was found between these points in this package.',
      422
    )
  }
  if (trip.legs.length !== request.locations.length - 1)
    throw new OfflineRouteError('Navigation engine returned an invalid number of route legs.', 502)
  const coordinates: [number, number][] = []
  const maneuvers: { instruction: string; distanceMeters: number; durationSeconds: number }[] = []
  const legs: {
    fromIndex: number
    toIndex: number
    distanceMeters: number
    durationSeconds: number
    maneuvers: typeof maneuvers
  }[] = []
  for (const [index, leg] of trip.legs.entries()) {
    if (
      !Number.isFinite(leg?.summary?.length) ||
      !Number.isFinite(leg?.summary?.time) ||
      leg.summary.length < 0 ||
      leg.summary.time < 0
    )
      throw new OfflineRouteError('Navigation engine returned an invalid route leg summary.', 502)
    if (typeof leg.shape !== 'string')
      throw new OfflineRouteError('Navigation engine returned invalid geometry.', 502)
    const points = decodePolyline6(leg.shape)
    const previous = coordinates[coordinates.length - 1]
    const skipFirst = previous && previous[0] === points[0][0] && previous[1] === points[0][1]
    for (let i = skipFirst ? 1 : 0; i < points.length; i++) coordinates.push(points[i])
    if (!Array.isArray(leg.maneuvers))
      throw new OfflineRouteError('Navigation engine returned invalid directions.', 502)
    const legManeuvers: typeof maneuvers = []
    for (const step of leg.maneuvers) {
      if (
        !Number.isFinite(step.length) ||
        !Number.isFinite(step.time) ||
        step.length < 0 ||
        step.time < 0
      )
        throw new OfflineRouteError('Navigation engine returned invalid directions.', 502)
      const maneuver = {
        instruction: String(step.instruction ?? ''),
        distanceMeters: Number(step.length ?? 0) * 1000,
        durationSeconds: Number(step.time ?? 0),
      }
      legManeuvers.push(maneuver)
      maneuvers.push(maneuver)
    }
    legs.push({
      fromIndex: index,
      toIndex: index + 1,
      distanceMeters: leg.summary.length * 1000,
      durationSeconds: leg.summary.time,
      maneuvers: legManeuvers,
    })
  }
  return {
    packageId: request.packageId,
    packageVersion: request.packageVersion,
    profile: request.profile,
    geometry: { type: 'LineString' as const, coordinates },
    distanceMeters: trip.summary.length * 1000,
    durationSeconds: trip.summary.time,
    maneuvers,
    legs,
    notice:
      'Offline estimate based on road data and travel mode. Live traffic and temporary closures are unavailable.',
  }
}
