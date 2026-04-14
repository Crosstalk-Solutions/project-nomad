import type { WikipediaLanguage } from './downloads.js'

export type SpecResource = {
  id: string
  version?: string
  title: string
  description: string
  url?: string             // present for English-only resources (static URL)
  size_mb: number
  // Multi-language fields (only present for resources available in multiple languages)
  zim_name?: string        // template e.g. "ifixit_{lang}_all"
  zim_flavour?: string     // e.g. "maxi", "nopic"
  available_languages?: string[]  // iso1 codes of languages this resource is available in
  size_mb_by_lang?: Record<string, number>
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
  kiwix_api: string
  languages: WikipediaLanguage[]
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
