import { useState, useRef, useEffect } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'

interface SearchResult {
  name: string
  kind: string
  sourceLayer: string
  coordinates: [number, number]
}

const KIND_LABELS: Record<string, string> = {
  city: 'City',
  town: 'Town',
  village: 'Village',
  hamlet: 'Hamlet',
  neighbourhood: 'Neighborhood',
  macrohood: 'Area',
  state: 'State',
  country: 'Country',
  locality: 'Locality',
  suburb: 'Suburb',
  pois: 'Point of Interest',
}

export default function MapSearchControl({
  onSearch,
  results,
  onSelect,
  onClear,
}: {
  onSearch: (query: string) => void
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const skipNextSearch = useRef(false)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (skipNextSearch.current) {
      skipNextSearch.current = false
      return
    }

    if (!value.trim()) {
      onClear()
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(() => {
      onSearch(value)
      setIsOpen(true)
    }, 300)
  }

  function handleSelectResult(result: SearchResult) {
    skipNextSearch.current = true
    setQuery(result.name)
    setIsOpen(false)
    onSelect(result)
  }

  function handleClear() {
    setQuery('')
    onClear()
    setIsOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      className="absolute top-20 left-4 z-40"
      style={{ width: '320px' }}
    >
      <div className="relative">
        <IconSearch
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.trim() && results.length > 0 && setIsOpen(true)}
          placeholder="Search places..."
          className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-white shadow-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <IconX size={18} />
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <ul className="mt-1 max-h-72 overflow-y-auto rounded-lg bg-white shadow-lg border border-gray-200">
          {results.map((result, i) => (
            <li key={`${result.name}-${result.kind}-${i}`}>
              <button
                onClick={() => handleSelectResult(result)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="text-sm font-medium text-gray-900">{result.name}</div>
                <div className="text-xs text-gray-500">
                  {KIND_LABELS[result.kind] || result.kind}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && query.trim() && results.length === 0 && (
        <div className="mt-1 px-4 py-3 rounded-lg bg-white shadow-lg border border-gray-200 text-sm text-gray-500">
          No places found. Try zooming in or panning to load more map data.
        </div>
      )}
    </div>
  )
}
