export type SpecResource = {
  id: string
  version: string
  title: string
  description: string
  url: string
  size_mb: number
}

export type SpecTier = {
  name: string
  slug: string
  description: string
  recommended?: boolean
  includesTier?: string
  resources: SpecResource[]
}

export type SpecCategory = {
  name: string
  slug: string
  icon: string
  description: string
  language: string
  tiers: SpecTier[]
}

export type SpecCollection = {
  name: string
  slug: string
  description: string
  icon: string
  language: string
  resources: SpecResource[]
}

export type ZimCategoriesSpec = {
  spec_version: string
  categories: SpecCategory[]
}

export type MapsSpec = {
  spec_version: string
  collections: SpecCollection[]
}

export type WikipediaOption = {
  id: string
  name: string
  description: string
  size_mb: number
  url: string | null
  version: string | null
}

export type WikipediaSpec = {
  spec_version: string
  options: WikipediaOption[]
}

export type ManifestType = 'zim_categories' | 'maps' | 'wikipedia'

export type ResourceStatus = 'installed' | 'not_installed' | 'update_available'

export type CategoryWithStatus = SpecCategory & {
  installedTierSlug?: string
}

export type CollectionWithStatus = SpecCollection & {
  all_installed: boolean
  installed_count: number
  total_count: number
}

export type ResourceUpdateCheckRequest = {
  resources: Array<{
    resource_id: string
    resource_type: 'zim' | 'map'
    installed_version: string
  }>
}

export type ResourceUpdateInfo = {
  resource_id: string
  resource_type: 'zim' | 'map'
  installed_version: string
  latest_version: string
  download_url: string
}

export type ContentUpdateCheckResult = {
  updates: ResourceUpdateInfo[]
  checked_at: string
  error?: string
}
