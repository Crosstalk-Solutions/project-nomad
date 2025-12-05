import vine from '@vinejs/vine'

export const curatedCollectionResourceValidator = vine.object({
  title: vine.string(),
  description: vine.string(),
  url: vine.string().url(),
  size_mb: vine.number().min(0).optional(),
})

export const curatedCollectionValidator = vine.object({
  slug: vine.string(),
  name: vine.string(),
  description: vine.string(),
  icon: vine.string(),
  language: vine.string().minLength(2).maxLength(5),
  resources: vine.array(curatedCollectionResourceValidator).minLength(1),
})

export const curatedCollectionsFileSchema = vine.object({
  collections: vine.array(curatedCollectionValidator).minLength(1),
})
