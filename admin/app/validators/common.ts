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

const resourceUpdateInfoBase = vine.object({
  resource_id: vine.string().trim().minLength(1),
  resource_type: vine.enum(['zim', 'map'] as const),
  installed_version: vine.string().trim(),
  latest_version: vine.string().trim().minLength(1),
  download_url: vine.string().url().trim(),
})

export const applyContentUpdateValidator = vine.compile(resourceUpdateInfoBase)

export const applyAllContentUpdatesValidator = vine.compile(
  vine.object({
    updates: vine
      .array(resourceUpdateInfoBase)
      .minLength(1),
  })
)
