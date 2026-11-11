/** Browser-independent map-link contract. Parsing never executes an action. */
export function parseMapPoint(value: string): { lat: number; lon: number } | null {
  const parts = value.split(',').map((part) => part.trim())
  const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i
  if (parts.length !== 2 || !parts.every((part) => decimal.test(part))) return null
  const [lat, lon] = parts.map(Number)
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon }
    : null
}

export function formatMapPoint(point: { lat: number; lon: number }) {
  return `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`
}

export function mapPointerMoved(start: { x: number; y: number }, end: { x: number; y: number }) {
  return Math.hypot(end.x - start.x, end.y - start.y) > 6
}

export interface MapRouteLink {
  origin: string
  destination: string
  vias: string[]
  profile: 'auto' | 'pedestrian'
  regionId: string
  packageVersion: string
  autoroute: boolean
  error?: string
}

export function parseMapRouteLink(search: string): MapRouteLink {
  const params = new URLSearchParams(search)
  const result: MapRouteLink = {
    origin: '',
    destination: '',
    vias: [],
    profile: 'auto',
    regionId: '',
    packageVersion: '',
    autoroute: false,
  }
  const fail = (message: string) => ({ ...result, autoroute: false, error: message })
  const viaNames = Array.from({ length: 5 }, (_, index) => `via${index + 1}`)
  for (const name of params.keys())
    if (/^via\d+$/.test(name) && !viaNames.includes(name))
      return fail('The map link supports up to five intermediate stops (seven points).')
  for (const name of [
    'origin',
    'destination',
    ...viaNames,
    'profile',
    'region',
    'version',
    'autoroute',
  ])
    if (params.getAll(name).length > 1)
      return fail('The map link contains duplicate ' + name + ' parameters.')
  for (const endpoint of ['origin', 'destination'] as const) {
    const value = params.get(endpoint)
    if (value !== null) {
      const point = parseMapPoint(value)
      if (!point) return fail('The map link contains invalid ' + endpoint + ' coordinates.')
      result[endpoint] = formatMapPoint(point)
    }
  }
  for (let index = 1; index < viaNames.length; index++)
    if (params.has(viaNames[index]) && !params.has(viaNames[index - 1]))
      return fail(`The map link requires ${viaNames[index - 1]} before ${viaNames[index]}.`)
  for (const name of viaNames) {
    const value = params.get(name)
    if (value !== null) {
      const point = parseMapPoint(value)
      if (!point) return fail('The map link contains invalid ' + name + ' coordinates.')
      result.vias.push(formatMapPoint(point))
    }
  }
  const profile = params.get('profile')
  if (profile !== null && profile !== 'auto' && profile !== 'pedestrian')
    return fail('The map link contains an unsupported travel mode.')
  if (profile) result.profile = profile
  const region = params.get('region'),
    version = params.get('version'),
    autoroute = params.get('autoroute')
  if (region !== null && !/^(packs|regions):[a-z0-9][a-z0-9_-]{0,119}$/.test(region))
    return fail('The map link contains an invalid routing region.')
  if (version !== null && (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(version) || !region))
    return fail('A pinned map version requires a valid routing region.')
  if (autoroute !== null && autoroute !== '0' && autoroute !== '1')
    return fail('The map link contains an invalid autoroute option.')
  result.regionId = region || ''
  result.packageVersion = version || ''
  if (autoroute === '1') {
    if (!result.origin || !result.destination)
      return fail('Automatic routing requires an origin and destination.')
    result.autoroute = true
  }
  return result
}
