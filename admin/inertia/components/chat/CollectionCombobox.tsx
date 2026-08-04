import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      // The list is portaled to <body>, so it is NOT inside containerRef — check both,
      // otherwise mousedown on an option closes the list before its click can land.
      const insideInput = containerRef.current?.contains(target)
      const insideList = dropdownRef.current?.contains(target)
      if (!insideInput && !insideList) {
        setIsOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  /**
   * The list renders in a portal with fixed positioning rather than absolutely inside
   * the input's own box. Every ancestor that sets `overflow` other than visible would
   * otherwise clip it: in the Knowledge Base table each cell carries `truncate`
   * (overflow:hidden), which cropped the list to a single row's height, and the modal
   * body is an `overflow-y-auto` scroller the list could not escape either. Fixed
   * positioning against the viewport sidesteps both.
   */
  const reposition = useCallback(() => {
    const input = containerRef.current
    if (!input) return
    const rect = input.getBoundingClientRect()
    const MAX_HEIGHT = 224 // matches max-h-56
    const GAP = 4
    const spaceBelow = window.innerHeight - rect.bottom
    // Flip above the input when the list would run off the bottom of the viewport
    // and there is more headroom up top.
    const flipUp = spaceBelow < MAX_HEIGHT + GAP && rect.top > spaceBelow
    setPosition({
      left: rect.left,
      top: flipUp ? Math.max(GAP, rect.top - GAP - MAX_HEIGHT) : rect.bottom + GAP,
      width: rect.width,
    })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    reposition()
    // `true` for capture so scrolling in any ancestor scroller keeps the list attached
    // to its input rather than leaving it stranded mid-air.
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [isOpen, reposition])

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
      {isOpen && !disabled && position && createPortal(
        <div
          ref={dropdownRef}
          style={{ left: position.left, top: position.top, width: position.width }}
          className="fixed z-[60] max-h-56 overflow-auto rounded border border-border-subtle bg-surface-primary shadow-lg"
        >
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
        </div>,
        document.body
      )}
    </div>
  )
}
