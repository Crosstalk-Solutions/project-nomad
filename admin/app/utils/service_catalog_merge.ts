/**
 * Merging catalog config onto an already-installed curated service.
 *
 * `ServiceSeeder.run()` keeps curated services in sync with the catalog by
 * overwriting `container_config` and `ui_location` on every boot. That is correct
 * for anything not yet installed, and wrong for anything that is: an install whose
 * published host port differs from the catalog default gets its port reset, which
 * desyncs the row from the container that is actually running. The Open link then
 * points at a port with nothing behind it, and the next recreate collides with
 * whatever process took the catalog port in the meantime.
 *
 * A host port diverges for an ordinary reason: the default was already taken on
 * that machine, so the user moved it. That is a property of the machine, not a
 * preference the catalog should get a vote on.
 *
 * These helpers keep the running install's host ports while still applying every
 * other catalog change, so an app on an alternate port continues to receive image,
 * env, metadata and scheme updates. The alternative considered was flagging such
 * rows `is_user_modified` so the sync skips them entirely, which also protects the
 * port but permanently opts that install out of all future catalog updates. This
 * is the narrower fix: preserve the one field the machine owns, sync the rest.
 */

/** `{ "8080/tcp": [{ "HostPort": "8090" }] }` keyed by container port. */
type PortBindings = Record<string, Array<{ HostPort?: string }> | undefined>

/**
 * `services.container_config` is a MySQL **json** column, so the driver hands back
 * an already-parsed object at runtime even though the model declares it
 * `string | null`. The catalog side of the comparison is a `JSON.stringify` string.
 * Both shapes reach these helpers, so accept either.
 *
 * This is not a hypothetical: a string-only version of this function silently
 * no-opped against a real database while passing every string-fixture unit test.
 */
type SerializedConfig = string | Record<string, any> | null | undefined

function parseConfig(value: SerializedConfig): Record<string, any> | null {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // A row we cannot parse gets the catalog value verbatim, which is the
    // pre-existing behaviour and no worse than what it has now.
    return null
  }
}

function readPortBindings(containerConfig: SerializedConfig): PortBindings | null {
  const bindings = parseConfig(containerConfig)?.HostConfig?.PortBindings
  if (!bindings || typeof bindings !== 'object') return null
  return bindings as PortBindings
}

function firstHostPort(bindings: PortBindings | null): string | null {
  if (!bindings) return null
  for (const list of Object.values(bindings)) {
    const port = Array.isArray(list) ? list[0]?.HostPort : undefined
    if (port) return String(port)
  }
  return null
}

/**
 * Catalog `container_config` with the live install's published host ports kept.
 *
 * Matching is per container-side port, so if the catalog changes which port the
 * app listens on *inside* the container, that is a genuine catalog change and the
 * catalog value wins. Only the host side of a binding the install already has is
 * preserved.
 */
export function mergeContainerConfigPreservingHostPorts<T extends string | null>(
  catalogConfig: T,
  liveConfig: SerializedConfig
): T {
  if (!catalogConfig) return catalogConfig
  const live = readPortBindings(liveConfig)
  if (!live) return catalogConfig

  const parsed = parseConfig(catalogConfig)
  if (!parsed) return catalogConfig

  const catalogBindings: PortBindings | undefined = parsed?.HostConfig?.PortBindings
  if (!catalogBindings || typeof catalogBindings !== 'object') return catalogConfig

  let changed = false
  for (const [containerPort, catalogList] of Object.entries(catalogBindings)) {
    const livePort = Array.isArray(live[containerPort]) ? live[containerPort]![0]?.HostPort : undefined
    if (!livePort) continue

    const catalogPort = Array.isArray(catalogList) ? catalogList[0]?.HostPort : undefined
    if (catalogPort === undefined || String(catalogPort) === String(livePort)) continue

    catalogBindings[containerPort] = [{ ...(Array.isArray(catalogList) ? catalogList[0] : {}), HostPort: String(livePort) }]
    changed = true
  }

  return (changed ? JSON.stringify(parsed) : catalogConfig) as T
}

/**
 * Catalog `ui_location` with the live install's port kept, when it is a port at all.
 *
 * `ui_location` is one of `"8090"`, `"https:8480"`, or a path like `"/chat"`. Only
 * the first two forms carry a port, and only those are rewritten. The catalog's
 * scheme is always taken, so a catalog change like Vaultwarden moving to `https:`
 * still reaches an install running on an alternate port.
 *
 * The live port is only honoured when it matches a host port the install actually
 * publishes. That keeps a stale or hand-edited `ui_location` from pinning the link
 * to a port nothing is listening on.
 */
export function mergeUiLocationPreservingHostPort(
  catalogUiLocation: string | null,
  liveUiLocation: string | null | undefined,
  liveConfig: SerializedConfig
): string | null {
  if (!catalogUiLocation || !liveUiLocation) return catalogUiLocation

  const catalogMatch = catalogUiLocation.match(/^(?:(https?):)?(\d+)$/)
  const liveMatch = liveUiLocation.match(/^(?:(https?):)?(\d+)$/)
  if (!catalogMatch || !liveMatch) return catalogUiLocation

  const livePort = liveMatch[2]
  if (livePort === catalogMatch[2]) return catalogUiLocation

  const bindings = readPortBindings(liveConfig)
  const publishedPorts = new Set(
    bindings
      ? Object.values(bindings)
          .flatMap((list) => (Array.isArray(list) ? list : []))
          .map((b) => (b?.HostPort ? String(b.HostPort) : null))
          .filter((p): p is string => p !== null)
      : []
  )
  if (!publishedPorts.has(livePort)) return catalogUiLocation

  const scheme = catalogMatch[1]
  return scheme ? `${scheme}:${livePort}` : livePort
}

/** Exported for tests: the first published host port in a serialized config. */
export function firstPublishedHostPort(containerConfig: SerializedConfig): string | null {
  return firstHostPort(readPortBindings(containerConfig))
}
