/**
 * Pure helpers for "Search all books" (#1519): build a kiwix-serve multi-book full-text
 * search URL (`/search?books.name=A&books.name=B&...&pattern=...`) from the books in
 * NOMAD's Kiwix library.
 *
 * kiwix-serve already searches many ZIMs in one request; it only refuses a request that
 * breaks one of its rules, and every refusal is a 400 page with no results, so each rule
 * is honoured here rather than left for the user to discover:
 *
 * - Books must be named. A bare `/search?pattern=x` is `invalid-request`, and a name
 *   kiwix-serve does not know (`no-such-book`) fails the whole search, not just that
 *   book. So names are derived exactly the way kiwix-serve derives them (see
 *   `kiwixBookNameFromPath`), never from the ZIM's `Name` metadata.
 * - Every named book must share one language. kiwix-serve unions the languages of all
 *   the named books and answers `confusion-of-tongues` unless exactly one remains. A
 *   multi-language ZIM (`ted_mul_*` lists "eng,fra,...") trips that even next to
 *   single-language books in one of its languages, and so does a book with no language
 *   at all (zero languages is not one). Those books are left out, and the rest are
 *   grouped by language so the user searches one language at a time.
 * - `--searchLimit` caps books per search. NOMAD does not pass it (KIWIX_LIBRARY_CMD),
 *   so it is unlimited; the cap that does bite on large libraries is URL length, since
 *   every book adds `books.name=<name>&` to the request line. A reverse proxy in front
 *   of Kiwix (custom URL) commonly rejects request lines over 8 KB (nginx's default),
 *   so the URL is kept under `MAX_SEARCH_URL_LENGTH` by dropping the smallest books
 *   first, and the caller is told how many were left out.
 */

/** One book from the Kiwix library XML, as the search box needs it. */
export interface SearchableBook {
  /** kiwix-serve's URL name for the book (`kiwixBookNameFromPath`). */
  name: string
  title: string
  /** Raw `language` attribute: ISO-639-3, comma-separated for multi-language ZIMs. */
  language?: string | null
  /** Used to decide which books to keep when the URL would be too long. */
  articleCount?: number | null
}

export interface SearchLanguageGroup {
  /** ISO-639-3 code, e.g. `eng`. */
  language: string
  /** Book names in this language, largest first, de-duplicated. */
  bookNames: string[]
}

/**
 * Conservative request-line budget. nginx rejects request lines over 8 KB by default
 * (`large_client_header_buffers 4 8k`), and a custom Kiwix URL is often a reverse proxy.
 * kiwix-serve itself (libmicrohttpd) allows more. #1519 measured 72 English books,
 * including Wikipedia, at roughly 3 KB, so this only bites on very large libraries.
 */
export const MAX_SEARCH_URL_LENGTH = 8000

/**
 * kiwix-serve's URL name for a book, mirroring libkiwix `Book::getHumanReadableIdFromPath()`:
 * lowercase and strip accents, take the file's basename, drop the `.zim` extension, then
 * spaces become `_` and `+` becomes `plus`. This is the name kiwix-serve's own viewer uses
 * for in-book search (`/search?books.name=${currentBook}`), and it is always mapped, unlike
 * the date-less alias, which collides when two editions of a book are installed.
 */
export function kiwixBookNameFromPath(path: string): string {
  const unaccented = path.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
  return unaccented
    .replace(/^.*\//, '')
    .replace(/\.zim[a-z]*$/, '')
    .replace(/ /g, '_')
    .replace(/\+/g, 'plus')
}

/** Split a library `language` attribute ("eng" or "eng,fra") into trimmed, non-empty codes. */
export function parseBookLanguages(language: string | null | undefined): string[] {
  return (language ?? '')
    .split(',')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/**
 * Group books by their single language, leaving out multi-language and language-less
 * books (either makes kiwix-serve answer `confusion-of-tongues`). Groups are ordered by
 * book count, most first (ties by code), so the first group is the dominant language.
 * Within a group, books are ordered largest first so a URL-length cut drops small books.
 */
export function groupSearchableBooksByLanguage(
  books: readonly SearchableBook[]
): SearchLanguageGroup[] {
  const byLanguage = new Map<string, SearchableBook[]>()
  for (const book of books) {
    if (!book.name) continue
    const languages = parseBookLanguages(book.language)
    if (languages.length !== 1) continue
    const [language] = languages
    const list = byLanguage.get(language) ?? []
    list.push(book)
    byLanguage.set(language, list)
  }

  const groups: SearchLanguageGroup[] = []
  for (const [language, list] of byLanguage) {
    const sorted = [...list].sort(
      (a, b) => (b.articleCount ?? 0) - (a.articleCount ?? 0) || a.name.localeCompare(b.name)
    )
    groups.push({ language, bookNames: [...new Set(sorted.map((b) => b.name))] })
  }

  groups.sort(
    (a, b) => b.bookNames.length - a.bookNames.length || a.language.localeCompare(b.language)
  )
  return groups
}

/** Primary language subtag in canonical (2-letter where one exists) form: `eng` -> `en`. */
function primaryLanguage(code: string): string | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(code)
    return canonical ? canonical.split('-')[0].toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Pick the language group to search by default: the first of the viewer's preferred
 * locales (e.g. `navigator.languages`, BCP-47 like `en-US`) that matches an installed
 * group, else the dominant group. Returns null when there are no groups.
 */
export function pickDefaultSearchLanguage(
  groups: readonly SearchLanguageGroup[],
  preferredLocales: readonly string[] = []
): string | null {
  if (groups.length === 0) return null
  for (const locale of preferredLocales) {
    const wanted = primaryLanguage(locale)
    if (!wanted) continue
    const match = groups.find((g) => primaryLanguage(g.language) === wanted)
    if (match) return match.language
  }
  return groups[0].language
}

export interface KiwixSearchUrlResult {
  url: string
  /** Books named in the URL. */
  includedCount: number
  /** Books left out to keep the URL under the length limit. */
  omittedCount: number
}

/**
 * Build the multi-book search URL against `baseUrl` (the Kiwix service link, which may
 * be a custom URL with a path prefix). Returns null when there is nothing to search:
 * a blank pattern, no books, or a limit too small for even one book.
 */
export function buildKiwixMultiBookSearchUrl(params: {
  baseUrl: string
  bookNames: readonly string[]
  pattern: string
  maxUrlLength?: number
}): KiwixSearchUrlResult | null {
  const pattern = params.pattern.trim()
  const names = [...new Set(params.bookNames.filter((n) => n.length > 0))]
  if (!pattern || names.length === 0) return null

  const maxUrlLength = params.maxUrlLength ?? MAX_SEARCH_URL_LENGTH
  const searchBase = `${params.baseUrl.replace(/\/+$/, '')}/search?`
  const patternParam = `pattern=${encodeURIComponent(pattern)}`

  // Add books in the order given (largest first) until the next one would overflow.
  let length = searchBase.length + patternParam.length
  const included: string[] = []
  for (const name of names) {
    const param = `books.name=${encodeURIComponent(name)}&`
    if (length + param.length > maxUrlLength) break
    included.push(param)
    length += param.length
  }
  if (included.length === 0) return null

  return {
    url: searchBase + included.join('') + patternParam,
    includedCount: included.length,
    omittedCount: names.length - included.length,
  }
}
