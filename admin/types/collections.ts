export type SpecResource = {
  id: string
  version: string
  title: string
  description: string
  url: string
  size_mb: number
  /**
   * Resource-type discriminator. Absent == 'zim' so every existing manifest
   * entry keeps the current ZIM download path. 'dataset' routes the tier
   * installer to the DB-ingested drug pipeline instead.
   */
  type?: 'zim' | 'dataset'
  /**
   * Marks a resource we host ourselves behind the entitlement Worker. Absent ==
   * unauthenticated, so every existing manifest entry is unchanged.
   *
   * 'nomad_app_key' means "send the bearer key that official release builds bake
   * in". It also pins the download to `url`: see resolveZimDownload, which
   * deliberately skips the Kiwix-catalog comparison for these so a resource-id
   * collision can never redirect our gated content to a third-party mirror.
   *
   * An enum rather than a boolean so a second scheme can be added later without
   * another schema change.
   */
  auth?: 'nomad_app_key'
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

// ---- Creator Packs spec ----
//
// A creator pack is a branded ZIM of a creator's curated YouTube videos, served
// offline through Kiwix. The public catalog carries display metadata ONLY — there
// is NO download url here. The bytes live in a private R2 bucket behind an
// entitlement Worker; CreatorPackService resolves the (stable) Worker URL and
// sends the auth header at install time. See project_content_creator_packs.
export type CreatorPack = {
  id: string
  name: string
  creator: string
  description: string
  /** YYYY-MM; combines with id as `<id>_<version>.zim` (parseZimFilename). */
  version: string
  /** InstalledResource.resource_id used for install/status reconciliation. */
  resource_id: string
  video_count: number
  size_mb: number
  license_id: string
  /**
   * Optional branded 1060x175 banner (the card hero). When omitted, the app
   * uses the banner it bundles by pack id (`/creator-packs/<id>.webp`). The
   * Kiwix grid icon is baked into the ZIM separately.
   */
  banner_url?: string
  /** Optional card art. */
  poster_url?: string
  logo_url?: string
}

export type CreatorPacksSpec = {
  spec_version: string
  packs: CreatorPack[]
}

export type CreatorPackStatus = 'installed' | 'downloading' | 'available'

export type CreatorPackWithStatus = CreatorPack & {
  status: CreatorPackStatus
  installed_version?: string
  /** Set when an installed pack has a newer catalog version available. */
  available_update_version?: string
}

export type ManifestType = 'zim_categories' | 'maps' | 'wikipedia' | 'creator_packs'

export type ResourceStatus = 'installed' | 'not_installed' | 'update_available'

export type CategoryWithStatus = SpecCategory & {
  installedTierSlug?: string
  // Highest tier whose every resource is either installed OR has an in-flight
  // download. Set only when it differs from installedTierSlug — i.e. the user
  // picked something larger and downloads are still running. Lets the UI show
  // the user's actual intent during the (often long) download window.
  downloadingTierSlug?: string
  // True when the in-flight resource for `downloadingTierSlug` is a DB-ingested
  // dataset (the FDA drug labels) whose download has finished and the heavy
  // ingest is running — so the card can flip "(downloading)" → "(indexing)" at
  // the handoff instead of looking stuck. Only meaningful with downloadingTierSlug.
  downloadingTierIndexing?: boolean
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
  size_bytes?: number
}

export type ContentUpdateCheckResult = {
  updates: ResourceUpdateInfo[]
  checked_at: string
  error?: string
}
