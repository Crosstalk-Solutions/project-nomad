import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IconSearch } from '@tabler/icons-react'
import Input from '~/components/inputs/Input'
import StyledButton from '~/components/StyledButton'
import api from '~/lib/api'
import {
  buildKiwixMultiBookSearchUrl,
  groupSearchableBooksByLanguage,
  pickDefaultSearchLanguage,
} from '../../app/utils/kiwix_search.js'

/** "eng" -> "English"; falls back to the code where the browser has no name for it. */
function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * "Search all books" (#1519): full-text search across every installed ZIM at once, using
 * kiwix-serve's own multi-book search. Results open in the Information Library in a new
 * tab, as kiwix-serve's normal results page. kiwix-serve only searches one language per
 * request, so with books in more than one language the user picks which to search.
 *
 * `kiwixBaseUrl` is the Information Library's link (custom URL honoured), so searches go
 * to the same place as the dashboard tile.
 */
export default function LibrarySearch({ kiwixBaseUrl }: { kiwixBaseUrl: string }) {
  const [pattern, setPattern] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)

  const { data: books } = useQuery({
    queryKey: ['kiwix-searchable-books'],
    queryFn: () => api.listSearchableBooks(),
    refetchOnWindowFocus: false,
  })

  const groups = useMemo(() => groupSearchableBooksByLanguage(books ?? []), [books])
  const language =
    selectedLanguage && groups.some((g) => g.language === selectedLanguage)
      ? selectedLanguage
      : pickDefaultSearchLanguage(groups, typeof navigator !== 'undefined' ? navigator.languages : [])
  const group = groups.find((g) => g.language === language)

  // Nothing kiwix-serve could search (no books yet, or only multi-language ones).
  if (!group) return null

  const result = buildKiwixMultiBookSearchUrl({
    baseUrl: kiwixBaseUrl,
    bookNames: group.bookNames,
    pattern,
  })
  const bookCount = group.bookNames.length

  const search = () => {
    if (result) window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <form
      className="px-4 pt-4"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        search()
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Input
          name="library-search"
          label="Search all books"
          helpText={`Full-text search across ${bookCount} ${bookCount === 1 ? 'book' : 'books'} in the Information Library. Results open in a new tab.`}
          placeholder="e.g. tomato blight"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="flex-1 min-w-[14rem]"
          leftIcon={<IconSearch className="w-5 h-5 text-text-muted" />}
        />
        {/* Only shown when there is a choice to make: kiwix-serve refuses a search that
            mixes languages, so each language is searched separately. */}
        {groups.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="library-search-language"
              className="text-sm font-medium text-text-secondary"
            >
              Language:
            </label>
            <select
              id="library-search-language"
              value={group.language}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="rounded-md border border-border-default bg-surface-primary text-text-primary px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-desert-green"
            >
              {groups.map((g) => (
                <option key={g.language} value={g.language}>
                  {languageLabel(g.language)} ({g.bookNames.length})
                </option>
              ))}
            </select>
          </div>
        )}
        <StyledButton icon="IconSearch" disabled={!result} onClick={search}>
          Search
        </StyledButton>
      </div>
      {result && result.omittedCount > 0 && (
        <p className="mt-2 text-sm text-text-muted">
          {result.omittedCount} smaller {result.omittedCount === 1 ? 'book is' : 'books are'} left
          out to keep the search request within size limits.
        </p>
      )}
    </form>
  )
}
