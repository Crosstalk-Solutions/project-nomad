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

export const deleteCustomAppValidator = vine.compile(
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
