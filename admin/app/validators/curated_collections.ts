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

/**
 * For validating the categories file, which has a different structure than the collections file
 * since it includes tiers within each category. 
 */
export const curatedCategoriesFileSchema = vine.object({
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
          resources: vine.array(curatedCollectionResourceValidator),
        })
      ),
    })
  ),
})
