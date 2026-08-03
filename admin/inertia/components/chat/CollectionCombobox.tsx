import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
 *
 * The option list is portaled to `document.body` and positioned via
 * `getBoundingClientRect()` rather than living in normal flow. This is used
 * inside table cells (e.g. the Stored Files panel), where any ancestor with
 * non-`visible` overflow -- a `<td>`, or `StyledTable`'s own scroll wrapper --
 * would otherwise clip the popover to that ancestor's box.
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
  // Whether the user has typed since the popover opened. The input is
  // pre-filled with `value` on open, but that shouldn't filter the option
  // list down to just the current value -- only actual typing should.
  const [userTyped, setUserTyped] = useState(false)
  const [popoverRect, setPopoverRect] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setIsOpen(false)
      setQuery(value)
      setUserTyped(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  // Position the portaled popover against the input's current screen
  // coordinates. Recomputed on open and kept in sync with scrolling/resizing
  // in any ancestor container (capture:true catches scroll events fired on
  // scrollable divs, which don't bubble to window on their own).
  useLayoutEffect(() => {
    if (!isOpen) return
    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPopoverRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen])

  const normalizedQuery = query.trim().toLowerCase()
  // Filtering (and the "+ Create" row) only kick in once the user has typed
  // -- otherwise the pre-filled current value would filter the list down to
  // just itself the instant the popover opens.
  const filterQuery = userTyped ? normalizedQuery : ''
  const filtered = filterQuery
    ? options.filter((o) => o.toLowerCase().includes(filterQuery))
    : options
  const exactMatch = options.find((o) => o.toLowerCase() === normalizedQuery)
  const showCreateOption = userTyped && normalizedQuery.length > 0 && !exactMatch

  const commit = (val: string) => {
    onChange(val)
    setQuery(val)
    setIsOpen(false)
    setUserTyped(false)
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
          setUserTyped(true)
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
            setUserTyped(false)
          }
        }}
        placeholder={placeholder}
        className="w-full rounded border border-border-subtle bg-surface-primary px-2 py-1 text-sm text-text-primary disabled:opacity-50"
      />
      {isOpen &&
        !disabled &&
        popoverRect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: popoverRect.top, left: popoverRect.left, width: popoverRect.width }}
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
