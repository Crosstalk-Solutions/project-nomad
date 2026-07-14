import { useEffect, useRef, useState } from 'react'

interface CollectionComboboxProps {
  /** Current value. Empty string means "Uncategorized". */
  value: string
  onChange: (value: string) => void
  /** Presets + known-in-use tags, already merged and deduped by the caller. */
  options: string[]
  placeholder?: string
  allowUncategorized?: boolean
  className?: string
  disabled?: boolean
}

/**
 * Dependency-free creatable combobox for collection tags. Lets you pick an
 * existing option (preset or already-in-use) or type a brand new one — the
 * "+ Create" row only appears when the (normalized) input doesn't already
 * match something. Actual normalization (trim/lowercase/length cap) happens
 * server-side via sanitizeCollectionName; this just lowercases for the
 * match-check and display so duplicates-by-case don't look like real options.
 */
export default function CollectionCombobox({
  value,
  onChange,
  options,
  placeholder = 'Uncategorized',
  allowUncategorized = true,
  className = '',
  disabled = false,
}: CollectionComboboxProps) {
  const [query, setQuery] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? options.filter((o) => o.toLowerCase().includes(normalizedQuery))
    : options
  const exactMatch = options.find((o) => o.toLowerCase() === normalizedQuery)
  const showCreateOption = normalizedQuery.length > 0 && !exactMatch

  const commit = (val: string) => {
    onChange(val)
    setQuery(val)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const trimmed = query.trim()
            if (!trimmed) {
              if (allowUncategorized) commit('')
              return
            }
            commit(exactMatch ?? trimmed.toLowerCase())
          } else if (e.key === 'Escape') {
            setIsOpen(false)
            setQuery(value)
          }
        }}
        placeholder={placeholder}
        className="w-full rounded border border-border-subtle bg-surface-primary px-2 py-1 text-sm text-text-primary disabled:opacity-50"
      />
      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded border border-border-subtle bg-surface-primary shadow-lg">
          {allowUncategorized && (
            <button
              type="button"
              className="block w-full text-left px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-secondary"
              onClick={() => commit('')}
            >
              Uncategorized
            </button>
          )}
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="block w-full text-left px-2 py-1.5 text-sm text-text-primary hover:bg-surface-secondary"
              onClick={() => commit(opt)}
            >
              {opt}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              className="block w-full text-left px-2 py-1.5 text-sm text-desert-green font-medium hover:bg-surface-secondary border-t border-border-subtle"
              onClick={() => commit(query.trim().toLowerCase())}
            >
              + Create "{query.trim().toLowerCase()}"
            </button>
          )}
          {filtered.length === 0 && !showCreateOption && (
            <div className="px-2 py-1.5 text-sm text-text-muted">No matches</div>
          )}
        </div>
      )}
    </div>
  )
}
