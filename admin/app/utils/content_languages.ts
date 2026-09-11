import {
  CONTENT_LANGUAGES,
  DEFAULT_CONTENT_LANGUAGE,
  type ContentLanguageCode,
} from '../../constants/content_languages.js'
import type { ZimCategoriesSpec } from '../../types/collections.js'

/**
 * Content-language plumbing, kept free of I/O so it can be unit tested.
 *
 * The one rule everything here protects: with the default setting (`en` only)
 * NOMAD must fetch exactly the same manifest URLs, cache them under exactly the
 * same keys and show exactly the same options as before this feature existed.
 * Other languages are purely additive and live in their own manifest files
 * (`collections/<code>/…`), which released builds never request.
 */

const SUPPORTED_CODES = new Set<string>(CONTENT_LANGUAGES.map((l) => l.code))

const COLLECTIONS_BASE_URL =
  'https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/collections'

/** Manifest types that have per-language variants. Maps and creator packs don't. */
export type LanguageScopedManifestType = 'zim_categories' | 'wikipedia'

const MANIFEST_FILENAMES: Record<LanguageScopedManifestType, string> = {
  zim_categories: 'kiwix-categories.json',
  wikipedia: 'wikipedia.json',
}

export function isSupportedContentLanguage(code: string): code is ContentLanguageCode {
  return SUPPORTED_CODES.has(code)
}

/**
 * Read the stored `content.languages` value ("en,fr"). Unknown codes are
 * dropped, duplicates collapsed, order kept. Anything unusable, including an
 * unset setting, falls back to English so a fresh install behaves as before.
 */
export function parseContentLanguages(raw: string | null | undefined): ContentLanguageCode[] {
  if (typeof raw !== 'string') return [DEFAULT_CONTENT_LANGUAGE]
  const codes: ContentLanguageCode[] = []
  for (const part of raw.split(',')) {
    const code = part.trim().toLowerCase()
    if (isSupportedContentLanguage(code) && !codes.includes(code)) codes.push(code)
  }
  return codes.length > 0 ? codes : [DEFAULT_CONTENT_LANGUAGE]
}

/** Setting-value validation for `content.languages`. Returns an error message or null. */
export function validateContentLanguagesValue(value: unknown): string | null {
  // The body parser turns "" into null, so an empty selection arrives here as null.
  if (value === null || value === undefined) {
    return 'Select at least one content language.'
  }
  if (typeof value !== 'string') {
    return 'Content languages must be a comma-separated list of language codes (e.g. "en,fr").'
  }
  const parts = value
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
  if (parts.length === 0) {
    return 'Select at least one content language.'
  }
  const unknown = parts.filter((p) => !isSupportedContentLanguage(p))
  if (unknown.length > 0) {
    return `Unsupported content language: ${unknown.join(', ')}.`
  }
  return null
}

/** Kiwix OPDS `lang` filter for the selected languages ("eng,fra"). */
export function toKiwixLangParam(codes: readonly string[]): string {
  const kiwix = codes
    .map((code) => CONTENT_LANGUAGES.find((l) => l.code === code)?.kiwix)
    .filter((k): k is (typeof CONTENT_LANGUAGES)[number]['kiwix'] => !!k)
  return kiwix.length > 0 ? kiwix.join(',') : 'eng'
}

/**
 * Where to fetch a manifest. English keeps its historical URL, byte for byte;
 * other languages read `collections/<code>/<file>`, a path no released build
 * knows about, so publishing one can never change what existing installs show.
 */
export function manifestUrlFor(type: LanguageScopedManifestType, code: string): string {
  const file = MANIFEST_FILENAMES[type]
  return code === DEFAULT_CONTENT_LANGUAGE
    ? `${COLLECTIONS_BASE_URL}/${file}`
    : `${COLLECTIONS_BASE_URL}/${code}/${file}`
}

/** Cache key in `collection_manifests`. English keeps the bare type so no migration is needed. */
export function manifestCacheKey(type: string, code: string): string {
  return code === DEFAULT_CONTENT_LANGUAGE ? type : `${type}:${code}`
}

/**
 * Prefix an id/slug with its language so a French "medicine" category or
 * "all-maxi" Wikipedia option can't collide with the English one. English ids
 * are left untouched, and prefixing is idempotent.
 */
export function namespaceForLanguage(id: string, code: string): string {
  if (code === DEFAULT_CONTENT_LANGUAGE) return id
  const prefix = `${code}:`
  return id.startsWith(prefix) ? id : `${prefix}${id}`
}

/**
 * Merge per-language category manifests into one spec for the picker. Each
 * category is stamped with the language of the manifest it came from, and
 * non-English slugs are namespaced. With only English present the English spec
 * is returned unchanged. Returns null when no language produced a spec.
 */
export function mergeZimCategorySpecs(
  specs: ReadonlyArray<{ language: string; spec: ZimCategoriesSpec | null }>
): ZimCategoriesSpec | null {
  const present = specs.filter(
    (s): s is { language: string; spec: ZimCategoriesSpec } => s.spec !== null
  )
  if (present.length === 0) return null
  if (present.length === 1 && present[0].language === DEFAULT_CONTENT_LANGUAGE) {
    return present[0].spec
  }

  const seen = new Set<string>()
  const categories: ZimCategoriesSpec['categories'] = []
  for (const { language, spec } of present) {
    for (const category of spec.categories) {
      const slug = namespaceForLanguage(category.slug, language)
      if (seen.has(slug)) continue
      seen.add(slug)
      categories.push({ ...category, slug, language })
    }
  }
  return {
    spec_version: present.map((s) => `${s.language}@${s.spec.spec_version}`).join('+'),
    categories,
  }
}

type LanguageTaggable = { id: string; language?: string }

/**
 * Merge Wikipedia options: English first (tagged `en`), then each other
 * language with ids namespaced. Only the English manifest's "none" option is
 * kept, so the picker still has exactly one "No Wikipedia" choice.
 */
export function mergeWikipediaOptions<T extends LanguageTaggable>(
  english: readonly T[],
  others: ReadonlyArray<{ language: string; options: readonly T[] }>
): Array<T & { language: string }> {
  const merged: Array<T & { language: string }> = english.map((opt) => ({
    ...opt,
    language: opt.language ?? DEFAULT_CONTENT_LANGUAGE,
  }))
  const seen = new Set(merged.map((o) => o.id))
  for (const { language, options } of others) {
    for (const opt of options) {
      if (opt.id === 'none') continue
      const id = namespaceForLanguage(opt.id, language)
      if (seen.has(id)) continue
      seen.add(id)
      merged.push({ ...opt, id, language })
    }
  }
  return merged
}

/**
 * Options to show for the selected languages: always "none", every option in a
 * selected language, and the current selection even when its language was
 * deselected, so an installed Wikipedia never disappears from the picker.
 */
export function filterWikipediaOptions<T extends LanguageTaggable>(
  options: readonly T[],
  codes: readonly string[],
  currentOptionId?: string | null
): T[] {
  return options.filter(
    (opt) =>
      opt.id === 'none' ||
      opt.id === currentOptionId ||
      codes.includes(opt.language ?? DEFAULT_CONTENT_LANGUAGE)
  )
}
