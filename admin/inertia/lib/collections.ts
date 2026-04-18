import type { SpecResource, SpecTier } from '../../types/collections'

/**
 * Resolve all resources for a tier, including inherited resources from includesTier chain.
 * Shared between frontend components (TierSelectionModal, CategoryCard, EasySetup).
 */
export function resolveTierResources(tier: SpecTier, allTiers: SpecTier[]): SpecResource[] {
  const visited = new Set<string>()
  return resolveTierResourcesInner(tier, allTiers, visited)
}

// ---- Multi-language helpers ----

/** Resolves the language-specific resource ID for matching against InstalledResource. */
export function resolveResourceId(resource: SpecResource, language: string): string {
  if (resource.zim_name) {
    const effectiveLang = resource.available_languages?.includes(language) ? language : 'en'
    return resource.zim_name.replace('{lang}', effectiveLang)
  }
  return resource.id
}

/** Returns the size in MB for a resource in the given language. */
export function getResourceSizeForLang(resource: SpecResource, language: string): number {
  if (resource.size_mb_by_lang) {
    const effectiveLang = resource.available_languages?.includes(language) ? language : 'en'
    if (effectiveLang in resource.size_mb_by_lang) {
      return resource.size_mb_by_lang[effectiveLang]
    }
  }
  return resource.size_mb
}

/** Returns whether a resource is available in the given language (or is English-only). */
export function isResourceAvailableInLang(resource: SpecResource, language: string): boolean {
  if (!resource.available_languages) return true // English-only, always available
  return resource.available_languages.includes(language)
}

/** Returns the effective language for a resource (the requested language if available, otherwise 'en'). */
export function getEffectiveLanguage(resource: SpecResource, language: string): string {
  if (!resource.available_languages) return 'en'
  return resource.available_languages.includes(language) ? language : 'en'
}

/** Breakdown of download sizes by language for a set of resources. */
export interface LanguageBreakdown {
  inSelectedLang: number  // bytes in the user's selected language
  inEnglish: number       // bytes that will download in English (fallback or English-only)
  total: number           // total bytes
}

/** Computes the size breakdown between selected language and English for a list of resources. */
export function getLanguageBreakdown(resources: SpecResource[], language: string): LanguageBreakdown {
  let inSelectedLang = 0
  let inEnglish = 0

  for (const r of resources) {
    const sizeBytes = getResourceSizeForLang(r, language) * 1024 * 1024
    if (language === 'en' || !r.available_languages) {
      // English selected OR resource has no language variants → counts as English
      inEnglish += sizeBytes
    } else if (r.available_languages.includes(language)) {
      // Available in the selected language
      inSelectedLang += sizeBytes
    } else {
      // Not available → falls back to English
      inEnglish += sizeBytes
    }
  }

  return { inSelectedLang, inEnglish, total: inSelectedLang + inEnglish }
}

function resolveTierResourcesInner(
  tier: SpecTier,
  allTiers: SpecTier[],
  visited: Set<string>
): SpecResource[] {
  if (visited.has(tier.slug)) return [] // cycle detection
  visited.add(tier.slug)

  const resources: SpecResource[] = []

  if (tier.includesTier) {
    const included = allTiers.find((t) => t.slug === tier.includesTier)
    if (included) {
      resources.push(...resolveTierResourcesInner(included, allTiers, visited))
    }
  }

  resources.push(...tier.resources)
  return resources
}
