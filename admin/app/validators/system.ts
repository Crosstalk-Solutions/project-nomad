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

export const updateServiceUiLocationValidator = vine.compile(
  vine.object({
    ui_location: vine.string().trim().minLength(1),
  })
)
