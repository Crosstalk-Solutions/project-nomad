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

export const remoteDownloadWithMetadataValidator = vine.compile(
  vine.object({
    url: vine
      .string()
      .url({
        require_tld: false, // Allow local URLs
      })
      .trim(),
    metadata: vine
      .object({
        title: vine.string().trim().minLength(1),
        summary: vine.string().trim().optional(),
        author: vine.string().trim().optional(),
        size_bytes: vine.number().optional(),
      })
      .optional(),
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

export const downloadCategoryTierValidator = vine.compile(
  vine.object({
    categorySlug: vine.string().trim().minLength(1),
    tierSlug: vine.string().trim().minLength(1),
  })
)

export const selectWikipediaValidator = vine.compile(
  vine.object({
    optionId: vine.string().trim().minLength(1),
  })
)
