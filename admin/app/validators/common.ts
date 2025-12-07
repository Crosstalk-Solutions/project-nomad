import vine from '@vinejs/vine'

export const remoteDownloadValidator = vine.compile(
  vine.object({
    url: vine
      .string()
      .url({
        require_tld: false, // Allow local URLs
      })
      .trim(),
  })
)

export const remoteDownloadValidatorOptional = vine.compile(
  vine.object({
    url: vine
      .string()
      .url({
        require_tld: false, // Allow local URLs
      })
      .trim()
      .optional(),
  })
)

export const filenameParamValidator = vine.compile(
  vine.object({
    params: vine.object({
      filename: vine.string().trim().minLength(1).maxLength(4096),
    }),
  })
)

export const downloadCollectionValidator = vine.compile(
  vine.object({
    slug: vine.string(),
  })
)
