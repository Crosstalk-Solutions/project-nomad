import vine from '@vinejs/vine'

export const installServiceValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
  })
)

export const affectServiceValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    action: vine.enum(['start', 'stop', 'restart']),
  })
)

export const subscribeToReleaseNotesValidator = vine.compile(
  vine.object({
    email: vine.string().email().trim(),
  })
)

export const checkLatestVersionValidator = vine.compile(
  vine.object({
    force: vine.boolean().optional(), // Optional flag to force bypassing cache and checking for updates immediately
  })
)

export const updateServiceValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    target_version: vine.string().trim(),
  })
)

export const preflightValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
  })
)

// Toggle per-app automatic updates (opt-in). The global master switch lives in
// the KVStore (`appAutoUpdate.enabled`) and flows through the settings endpoint.
export const setServiceAutoUpdateValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    enabled: vine.boolean(),
  })
)

// Shared sub-schema for a volume bind mapping. A colon is Docker's bind delimiter
// (host:container:options) — forbid it in either field so a path can't smuggle in an
// extra segment that the guard reads as safe but Docker re-parses as a different mount.
const volumeSchema = vine.object({
  host_path: vine.string().trim().regex(/^[^:]+$/),
  container_path: vine.string().trim().regex(/^[^:]+$/),
})

// Environment variables must be KEY=value (value may be empty), matching Docker's Env format.
const envVarSchema = vine.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*=[\s\S]*$/)

// Service-less preflight for the custom-app form: evaluates ports, volumes and image together.
export const preflightCustomValidator = vine.compile(
  vine.object({
    image: vine.string().trim().optional(),
    ports: vine.array(vine.number().min(1).max(65535)).optional(),
    volumes: vine.array(volumeSchema).optional(),
    // When editing, ignore port conflicts caused by this app's own running container.
    exclude_service: vine.string().trim().optional(),
  })
)

export const customAppValidator = vine.compile(
  vine.object({
    friendly_name: vine.string().trim().minLength(1).maxLength(100),
    image: vine.string().trim().minLength(1),
    ports: vine
      .array(
        vine.object({
          container: vine.number().min(1).max(65535),
          host: vine.number().min(1024).max(65535),
        })
      )
      .optional(),
    volumes: vine.array(volumeSchema).optional(),
    env: vine.array(envVarSchema).optional(),
    category: vine
      .enum(['productivity', 'media', 'security', 'networking', 'utility', 'ai', 'education', 'custom'])
      .optional(),
    icon: vine.string().trim().optional(),
    // Optional resource caps (advanced). Default caps are applied when omitted.
    memory_mb: vine.number().min(64).optional(),
    cpus: vine.number().min(0.1).max(64).optional(),
    // When true, bypass advisory preflight (port conflicts / guard warnings) and install anyway.
    force: vine.boolean().optional(),
  })
)

// Set or clear an app's custom launch URL. A null/empty value clears the override; a non-empty
// value is normalized + validated to a http(s) URL by normalizeCustomUrl in the controller.
export const setServiceCustomUrlValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    custom_url: vine.string().trim().nullable(),
  })
)

/**
 * Normalize a user-supplied custom app URL (backend twin of the inertia helper in
 * lib/navigation.ts). Accepts a bare host or a full URL; prepends http:// when no scheme is
 * present. Returns the normalized href, or null when empty (clears the override) or not a valid
 * http(s) URL. Restricting to http/https blocks javascript:/data: from ever being stored.
 */
export function normalizeCustomUrl(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

/**
 * Dashboard link tile: a shortcut to something the user already runs, with no
 * container behind it. One `url` field rather than separate host/port/path,
 * because people paste URLs and it gets https and sub-paths for free. The URL is
 * normalized and http(s)-restricted by normalizeCustomUrl in the controller,
 * which is what keeps javascript:/data: out of an href.
 */
export const createLinkTileValidator = vine.compile(
  vine.object({
    friendly_name: vine.string().trim().minLength(1).maxLength(60),
    url: vine.string().trim().minLength(1).maxLength(2048),
    description: vine.string().trim().maxLength(200).nullable().optional(),
    icon: vine.string().trim().maxLength(60).nullable().optional(),
    display_order: vine.number().min(0).max(999).optional(),
  })
)

/** Reconfigure an existing link tile. Identified by service_name, which is immutable. */
export const updateLinkTileValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    friendly_name: vine.string().trim().minLength(1).maxLength(60),
    url: vine.string().trim().minLength(1).maxLength(2048),
    description: vine.string().trim().maxLength(200).nullable().optional(),
    icon: vine.string().trim().maxLength(60).nullable().optional(),
    display_order: vine.number().min(0).max(999).optional(),
  })
)

export const deleteLinkTileValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
  })
)

export const deleteCustomAppValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    // When true, also remove the backing Docker image (best-effort).
    remove_image: vine.boolean().optional(),
  })
)

export const uninstallServiceValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    // When true, also remove the backing Docker image (best-effort).
    remove_image: vine.boolean().optional(),
  })
)

export const serviceLogsValidator = vine.compile(
  vine.object({
    tail: vine.number().min(1).max(2000).optional(),
  })
)

// Reconfigure an existing custom app: the create shape plus the target service_name.
export const updateCustomAppValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim(),
    friendly_name: vine.string().trim().minLength(1).maxLength(100),
    image: vine.string().trim().minLength(1),
    ports: vine
      .array(
        vine.object({
          container: vine.number().min(1).max(65535),
          host: vine.number().min(1024).max(65535),
        })
      )
      .optional(),
    volumes: vine.array(volumeSchema).optional(),
    env: vine.array(envVarSchema).optional(),
    category: vine
      .enum(['productivity', 'media', 'security', 'networking', 'utility', 'ai', 'education', 'custom'])
      .optional(),
    icon: vine.string().trim().optional(),
    memory_mb: vine.number().min(64).optional(),
    cpus: vine.number().min(0.1).max(64).optional(),
    force: vine.boolean().optional(),
  })
)
