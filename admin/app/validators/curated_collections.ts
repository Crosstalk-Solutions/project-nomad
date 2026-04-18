import vine from '@vinejs/vine'

// ---- Language entry (shared by Wikipedia and ZIM categories) ----

export const wikipediaLanguageSchema = vine.object({
  iso1: vine.string().minLength(2).maxLength(2),
  iso3: vine.string().minLength(3).maxLength(3),
  name: vine.string(),
  name_local: vine.string(),
})

// ---- Versioned resource validators (with id + version) ----

export const specResourceValidator = vine.object({
  id: vine.string(),
  version: vine.string().optional(),
  title: vine.string(),
  description: vine.string(),
  url: vine.string().url().optional(),
  size_mb: vine.number().min(0),
  // Multi-language fields (only present for resources available in multiple languages)
  zim_name: vine.string().optional(),
  zim_flavour: vine.string().optional(),
  available_languages: vine.array(vine.string()).optional(),
  size_mb_by_lang: vine.record(vine.number()).optional(),
})

// ---- Maps resource validator (url and version are required for maps) ----

export const mapsResourceValidator = vine.object({
  id: vine.string(),
  version: vine.string(),
  title: vine.string(),
  description: vine.string(),
  url: vine.string().url(),
  size_mb: vine.number().min(0).optional(),
})

// ---- ZIM Categories spec (versioned, multilanguage) ----

export const zimCategoriesSpecSchema = vine.object({
  spec_version: vine.string(),
  kiwix_api: vine.string().url(),
  languages: vine.array(wikipediaLanguageSchema).minLength(1),
  categories: vine.array(
    vine.object({
      name: vine.string(),
      slug: vine.string(),
      icon: vine.string(),
      description: vine.string(),
      tiers: vine.array(
        vine.object({
          name: vine.string(),
          slug: vine.string(),
          description: vine.string(),
          recommended: vine.boolean().optional(),
          includesTier: vine.string().optional(),
          resources: vine.array(specResourceValidator),
        })
      ),
    })
  ),
})

// ---- Maps spec (versioned) ----

export const mapsSpecSchema = vine.object({
  spec_version: vine.string(),
  collections: vine.array(
    vine.object({
      slug: vine.string(),
      name: vine.string(),
      description: vine.string(),
      icon: vine.string(),
      language: vine.string().minLength(2).maxLength(5),
      resources: vine.array(mapsResourceValidator).minLength(1),
    })
  ).minLength(1),
})

// ---- Wikipedia spec (versioned, multilanguage) ----

export const wikipediaSpecSchema = vine.object({
  spec_version: vine.string(),
  kiwix_api: vine.string().url(),
  languages: vine.array(wikipediaLanguageSchema).minLength(1),
  options: vine.array(
    vine.object({
      id: vine.string(),
      name: vine.string(),
      description: vine.string(),
      size_mb: vine.number().min(0),
      url: vine.string().url().nullable().optional(),
      version: vine.string().nullable().optional(),
      zim_name: vine.string().optional(),
      zim_flavour: vine.string().optional(),
      size_mb_by_lang: vine.record(vine.number()).optional(),
    })
  ).minLength(1),
})

// ---- Wikipedia validators (used by ZimService) ----

export const wikipediaOptionSchema = vine.object({
  id: vine.string(),
  name: vine.string(),
  description: vine.string(),
  size_mb: vine.number().min(0),
  url: vine.string().url().nullable().optional(),
  zim_name: vine.string().optional(),
  zim_flavour: vine.string().optional(),
  size_mb_by_lang: vine.record(vine.number()).optional(),
})

export const wikipediaOptionsFileSchema = vine.object({
  spec_version: vine.string(),
  kiwix_api: vine.string().url(),
  languages: vine.array(wikipediaLanguageSchema).minLength(1),
  options: vine.array(wikipediaOptionSchema).minLength(1),
})
