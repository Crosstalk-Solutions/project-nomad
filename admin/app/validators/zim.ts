import vine from '@vinejs/vine'

export const listRemoteZimValidator = vine.compile(
  vine.object({
    start: vine.number().min(0).optional(),
    count: vine.number().min(1).max(100).optional(),
    query: vine.string().optional(),
    // An ISO-639-3 code (`eng`, `fra`, `zho`) or the literal `all`. Constrained to a
    // short alphabetic token so this can never smuggle anything else into the upstream
    // catalog query string.
    language: vine
      .string()
      .trim()
      .regex(/^(all|[a-z]{2,8})$/)
      .optional(),
  })
)

export const addCustomLibraryValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(100),
    base_url: vine
      .string()
      .url({ require_tld: false })
      .trim(),
  })
)

export const browseLibraryValidator = vine.compile(
  vine.object({
    url: vine
      .string()
      .url({ require_tld: false })
      .trim(),
  })
)

export const idParamValidator = vine.compile(
  vine.object({
    params: vine.object({
      id: vine.number(),
    }),
  })
)
