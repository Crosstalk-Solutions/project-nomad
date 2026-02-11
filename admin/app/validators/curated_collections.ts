import vine from '@vinejs/vine'

// ---- Versioned resource validators (with id + version) ----

export const specResourceValidator = vine.object({
  id: vine.string(),
  version: vine.string(),
  title: vine.string(),
  description: vine.string(),
  url: vine.string().url(),
  size_mb: vine.number().min(0).optional(),
})

// ---- ZIM Categories spec (versioned) ----

export const zimCategoriesSpecSchema = vine.object({
  spec_version: vine.string(),
  categories: vine.array(
    vine.object({
      name: vine.string(),
      slug: vine.string(),
      icon: vine.string(),
      description: vine.string(),
      language: vine.string().minLength(2).maxLength(5),
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
      resources: vine.array(specResourceValidator).minLength(1),
    })
  ).minLength(1),
})

// ---- Wikipedia spec (versioned) ----

export const wikipediaSpecSchema = vine.object({
  spec_version: vine.string(),
  options: vine.array(
    vine.object({
      id: vine.string(),
      name: vine.string(),
      description: vine.string(),
      size_mb: vine.number().min(0),
      url: vine.string().url().nullable(),
      version: vine.string().nullable(),
    })
  ).minLength(1),
})

// ---- Wikipedia validators (used by ZimService) ----

export const wikipediaOptionSchema = vine.object({
  id: vine.string(),
  name: vine.string(),
  description: vine.string(),
  size_mb: vine.number().min(0),
  url: vine.string().url().nullable(),
})

export const wikipediaOptionsFileSchema = vine.object({
  options: vine.array(wikipediaOptionSchema).minLength(1),
})
