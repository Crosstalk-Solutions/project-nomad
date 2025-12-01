import vine from '@vinejs/vine'

export const remoteDownloadValidator = vine.compile(
  vine.object({
    url: vine.string().url().trim(),
  })
)

export const remoteDownloadValidatorOptional = vine.compile(
  vine.object({
    url: vine.string().url().trim().optional(),
  })
)

export const filenameValidator = vine.compile(
  vine.object({
    filename: vine.string().trim().minLength(1).maxLength(4096),
  })
)
