/**
 * Map pin layer export/import (#1387).
 *
 * The NOMAD pin file is a versioned JSON document that moves pins between
 * Project NOMAD installs one layer at a time. Everything in here is pure (no DB,
 * no vine) so the parsing, validation, route remapping and de-duplication rules
 * can be unit-tested directly. An imported file is untrusted input: only
 * whitelisted keys are copied, and anything out of range rejects the whole file
 * so an import is all-or-nothing.
 */

export const PIN_FILE_FORMAT = 'nomad-map-pins'
export const CURRENT_FORMAT_VERSION = 1
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_LAYERS = 50
export const MAX_IMPORT_MARKERS = 5000
export const MAX_LAYER_NAME_LENGTH = 100

export interface PinRecord {
  name: string
  latitude: number
  longitude: number
  color: string
  custom_color: string | null
  icon: string | null
  icon_color: string | null
  visible: boolean
  marker_type: string
  route_id: string | null
  route_order: number | null
  notes: string | null
}

export interface PinLayerRecord {
  name: string
  visible: boolean
  markers: PinRecord[]
}

export interface PinFile {
  format: typeof PIN_FILE_FORMAT
  format_version: number
  exported_at: string
  app_version: string | null
  layers: PinLayerRecord[]
}

export type ParseResult = { ok: true; layers: PinLayerRecord[] } | { ok: false; errors: string[] }

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Copy only the fields we export, in a stable order. */
export function toPinRecord(marker: PinRecord): PinRecord {
  return {
    name: marker.name,
    latitude: marker.latitude,
    longitude: marker.longitude,
    color: marker.color,
    custom_color: marker.custom_color ?? null,
    icon: marker.icon ?? null,
    icon_color: marker.icon_color ?? null,
    visible: Boolean(marker.visible),
    marker_type: marker.marker_type,
    route_id: marker.route_id ?? null,
    route_order: marker.route_order ?? null,
    notes: marker.notes ?? null,
  }
}

export function buildPinFile(
  layers: Array<{ name: string; visible: boolean; markers: PinRecord[] }>,
  appVersion: string | null,
  now: Date = new Date()
): PinFile {
  return {
    format: PIN_FILE_FORMAT,
    format_version: CURRENT_FORMAT_VERSION,
    exported_at: now.toISOString(),
    app_version: appVersion,
    layers: layers.map((layer) => ({
      name: layer.name,
      visible: Boolean(layer.visible),
      markers: layer.markers.map(toPinRecord),
    })),
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(
  value: unknown,
  maxLength: number,
  path: string,
  errors: string[]
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.length > maxLength) {
    errors.push(`${path} must be text of at most ${maxLength} characters`)
    return null
  }
  return value
}

function parseMarker(raw: unknown, path: string, errors: string[]): PinRecord | null {
  if (!isPlainObject(raw)) {
    errors.push(`${path} must be an object`)
    return null
  }
  const before = errors.length

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name.length < 1 || name.length > 255) {
    errors.push(`${path}.name must be 1-255 characters`)
  }

  const latitude = raw.latitude
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.push(`${path}.latitude must be a number from -90 to 90`)
  }
  const longitude = raw.longitude
  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    errors.push(`${path}.longitude must be a number from -180 to 180`)
  }

  let color = 'orange'
  if (raw.color !== undefined && raw.color !== null) {
    if (typeof raw.color !== 'string' || raw.color.length > 20) {
      errors.push(`${path}.color must be text of at most 20 characters`)
    } else if (raw.color.trim()) {
      color = raw.color.trim()
    }
  }

  const markerType =
    raw.marker_type === undefined || raw.marker_type === null ? 'pin' : raw.marker_type
  if (typeof markerType !== 'string' || markerType.length < 1 || markerType.length > 20) {
    errors.push(`${path}.marker_type must be 1-20 characters`)
  }

  const routeId = optionalString(raw.route_id, 64, `${path}.route_id`, errors)
  let routeOrder: number | null = null
  if (raw.route_order !== undefined && raw.route_order !== null) {
    if (!Number.isInteger(raw.route_order) || (raw.route_order as number) < 0) {
      errors.push(`${path}.route_order must be a whole number of 0 or more`)
    } else {
      routeOrder = raw.route_order as number
    }
  }

  const notes = optionalString(raw.notes, 500, `${path}.notes`, errors)
  const icon = optionalString(raw.icon, 50, `${path}.icon`, errors)

  if (errors.length > before) return null

  // Style fields that fail a format check are not worth rejecting a file over.
  const customColor =
    typeof raw.custom_color === 'string' && HEX_COLOR.test(raw.custom_color) ? raw.custom_color : null
  const iconColor =
    typeof raw.icon_color === 'string' && HEX_COLOR.test(raw.icon_color) ? raw.icon_color : null

  return {
    name,
    latitude: latitude as number,
    longitude: longitude as number,
    color,
    custom_color: customColor,
    icon,
    icon_color: iconColor,
    visible: typeof raw.visible === 'boolean' ? raw.visible : true,
    marker_type: markerType as string,
    route_id: routeId,
    route_order: routeOrder,
    notes,
  }
}

/** Validate an uploaded pin file. Rejects the whole file on any invalid pin. */
export function parsePinFile(raw: unknown): ParseResult {
  if (!isPlainObject(raw) || raw.format !== PIN_FILE_FORMAT) {
    return { ok: false, errors: ['This is not a Project NOMAD map pins file.'] }
  }
  const version = raw.format_version
  if (!Number.isInteger(version) || (version as number) < 1) {
    return { ok: false, errors: ['The file has an invalid format_version.'] }
  }
  if ((version as number) > CURRENT_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [
        'This file was made by a newer version of Project NOMAD. Update this server to import it.',
      ],
    }
  }
  if (!Array.isArray(raw.layers) || raw.layers.length === 0) {
    return { ok: false, errors: ['The file contains no layers.'] }
  }
  if (raw.layers.length > MAX_IMPORT_LAYERS) {
    return { ok: false, errors: [`A file can hold at most ${MAX_IMPORT_LAYERS} layers.`] }
  }

  let markerCount = 0
  for (const layer of raw.layers) {
    if (isPlainObject(layer) && Array.isArray(layer.markers)) markerCount += layer.markers.length
  }
  if (markerCount > MAX_IMPORT_MARKERS) {
    return { ok: false, errors: [`A file can hold at most ${MAX_IMPORT_MARKERS} pins.`] }
  }

  const errors: string[] = []
  const layers: PinLayerRecord[] = []
  raw.layers.forEach((rawLayer, layerIndex) => {
    const path = `layers[${layerIndex}]`
    if (!isPlainObject(rawLayer)) {
      errors.push(`${path} must be an object`)
      return
    }
    const name = typeof rawLayer.name === 'string' ? rawLayer.name.trim() : ''
    if (name.length < 1 || name.length > MAX_LAYER_NAME_LENGTH) {
      errors.push(`${path}.name must be 1-${MAX_LAYER_NAME_LENGTH} characters`)
    }
    if (!Array.isArray(rawLayer.markers)) {
      errors.push(`${path}.markers must be a list`)
      return
    }
    const markers: PinRecord[] = []
    rawLayer.markers.forEach((rawMarker, markerIndex) => {
      const marker = parseMarker(rawMarker, `${path}.markers[${markerIndex}]`, errors)
      if (marker) markers.push(marker)
    })
    layers.push({
      name,
      visible: typeof rawLayer.visible === 'boolean' ? rawLayer.visible : true,
      markers,
    })
  })

  if (errors.length > 0) {
    // Cap the list so one bad file can't produce a megabyte of error text.
    return { ok: false, errors: errors.slice(0, 20) }
  }
  return { ok: true, layers }
}

/**
 * Give every route in the import a fresh id so it can't collide with a route
 * already on this server. Routes are scoped per file layer: the same old id in
 * two layers becomes two different routes. Order within a route is kept.
 */
export function remapRouteIds(layers: PinLayerRecord[], newId: () => string): PinLayerRecord[] {
  return layers.map((layer) => {
    const ids = new Map<string, string>()
    return {
      ...layer,
      markers: layer.markers.map((marker) => {
        if (marker.route_id === null) return marker
        let mapped = ids.get(marker.route_id)
        if (!mapped) {
          mapped = newId()
          ids.set(marker.route_id, mapped)
        }
        return { ...marker, route_id: mapped }
      }),
    }
  })
}

type Located = Pick<PinRecord, 'name' | 'latitude' | 'longitude' | 'route_id' | 'route_order'>

const pinKey = (m: Located) => `${m.name}\u0000${m.latitude}\u0000${m.longitude}`

function routeSignatures(markers: Located[]): Map<string, string> {
  const routes = new Map<string, Located[]>()
  for (const marker of markers) {
    if (marker.route_id === null) continue
    const list = routes.get(marker.route_id) ?? []
    list.push(marker)
    routes.set(marker.route_id, list)
  }
  const signatures = new Map<string, string>()
  for (const [routeId, points] of routes) {
    points.sort((a, b) => (a.route_order ?? 0) - (b.route_order ?? 0))
    signatures.set(routeId, points.map(pinKey).join('\u0001'))
  }
  return signatures
}

/**
 * Drop incoming markers that already exist in the target layer, so importing the
 * same file twice doesn't double every pin. Single pins match on name and exact
 * coordinates. A route is skipped only as a whole, when every point matches an
 * existing route in order, so a merge never leaves a route with gaps.
 */
export function dedupeForMerge<T extends Located>(
  existing: Located[],
  incoming: T[]
): { kept: T[]; skipped: number } {
  const existingPins = new Set(existing.filter((m) => m.route_id === null).map(pinKey))
  const existingRoutes = new Set(routeSignatures(existing).values())
  const incomingRoutes = routeSignatures(incoming)

  const kept: T[] = []
  let skipped = 0
  for (const marker of incoming) {
    const duplicate =
      marker.route_id === null
        ? existingPins.has(pinKey(marker))
        : existingRoutes.has(incomingRoutes.get(marker.route_id)!)
    if (duplicate) {
      skipped++
    } else {
      kept.push(marker)
    }
  }
  return { kept, skipped }
}

/** Pin and route counts for the post-import summary. */
export function summarizeMarkers(markers: Array<Pick<PinRecord, 'route_id'>>): {
  pins: number
  routes: number
} {
  const routes = new Set(markers.filter((m) => m.route_id !== null).map((m) => m.route_id))
  return { pins: markers.length, routes: routes.size }
}

/** "Rally points" -> "Rally points (2)" when the name is already taken. */
export function uniqueLayerName(name: string, taken: Iterable<string>): string {
  const lower = new Set([...taken].map((n) => n.toLowerCase()))
  if (!lower.has(name.toLowerCase())) return name
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const candidate = name.slice(0, MAX_LAYER_NAME_LENGTH - suffix.length) + suffix
    if (!lower.has(candidate.toLowerCase())) return candidate
  }
}

/** Safe download filename: nomad-pins-<slug>-YYYYMMDD.json. */
export function exportFilename(label: string, now: Date = new Date()): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'layer'
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `nomad-pins-${slug}-${date}.json`
}
