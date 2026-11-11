import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconCrosshair, IconX } from '@tabler/icons-react'
import {
  classifyOmniboxQuery,
  coordinateOmniboxPlace,
  validSearchCenter,
  type OmniboxPlace,
} from '../../../app/utils/map_omnibox'

type Props = {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  onSelect: (place: OmniboxPlace) => void
  onFocus?: () => void
  onConfirm?: () => void
  readOnly?: boolean
  compact?: boolean
  selected?: OmniboxPlace | null
}

export default function MapOmnibox({
  name,
  label,
  value,
  onChange,
  onSelect,
  onFocus,
  onConfirm,
  selected,
  readOnly = false,
  compact = false,
}: Props) {
  const input = useRef<HTMLInputElement | null>(null)
  const popup = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [position, setPosition] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
    maxHeight: number
  } | null>(null)
  const queryKind = classifyOmniboxQuery(value)
  const selectedMatches = !!selected && selected.label === value && validSearchCenter(selected)
  const results = useMemo(() => {
    if (queryKind === 'invalid-coordinates') return []
    if (selectedMatches) return [selected!]
    const coordinate = coordinateOmniboxPlace(value)
    if (coordinate) return [coordinate]
    return []
  }, [value, queryKind, selected, selectedMatches])
  const activeIndex = Math.max(
    0,
    results.findIndex((result) => result.id === activeId)
  )
  const listId = `${name}-suggestions`

  useEffect(() => {
    if (readOnly) setOpen(false)
  }, [readOnly])
  useLayoutEffect(() => {
    if (!open || readOnly) return
    const update = () => {
      const rect = input.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 290), window.innerWidth - 16)
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const useAbove = below < 180 && above > below
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        ...(useAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        maxHeight: Math.max(80, Math.min(340, (useAbove ? above : below) - 4)),
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, readOnly])

  const choose = (place: OmniboxPlace) => {
    setOpen(false)
    setActiveId(null)
    onSelect(place)
  }
  const visible = open && !readOnly && value.trim().length > 0 && !!position
  return (
    <div
      className="min-w-0"
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null
        if (!event.currentTarget.contains(next) && !popup.current?.contains(next)) setOpen(false)
      }}
    >
      <label htmlFor={name} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <IconCrosshair
          size={16}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          ref={input}
          id={name}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={listId}
          aria-activedescendant={
            visible && results.length ? `${name}-option-${activeIndex}` : undefined
          }
          placeholder="Latitude, longitude"
          value={value}
          readOnly={readOnly}
          className={`block w-full rounded-md border border-border-default bg-surface-primary pl-8 pr-8 text-text-primary placeholder:text-text-muted focus:outline-2 focus:-outline-offset-2 focus:outline-desert-orange ${compact ? 'py-1.5 text-sm' : 'py-2 text-sm'}`}
          onFocus={() => {
            if (!readOnly) setOpen(true)
            onFocus?.()
          }}
          onClick={() => {
            if (!readOnly) setOpen(true)
          }}
          onChange={(event) => {
            setActiveId(null)
            setOpen(true)
            onChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              return
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              setOpen(true)
              if (results.length)
                setActiveId(
                  results[
                    activeId === null
                      ? event.key === 'ArrowDown'
                        ? 0
                        : results.length - 1
                      : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) %
                        results.length
                  ].id
                )
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              if (selectedMatches && results[activeIndex]?.id === selected?.id && onConfirm) {
                setOpen(false)
                onConfirm()
              } else if (open && results[activeIndex]) choose(results[activeIndex])
              else if (queryKind === 'coordinates') choose(coordinateOmniboxPlace(value)!)
              else setOpen(true)
            }
          }}
        />
        {value && !readOnly && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:bg-surface-secondary"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('')
              setActiveId(null)
              input.current?.focus({ preventScroll: true })
            }}
          >
            <IconX size={15} />
          </button>
        )}
      </div>
      {visible &&
        createPortal(
          <div
            ref={popup}
            style={position!}
            className="fixed z-[10000] overflow-y-auto rounded-md border border-border-default bg-surface-primary shadow-lg"
            onMouseDown={(event) => event.preventDefault()}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null
              if (!event.currentTarget.contains(next) && next !== input.current) setOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                input.current?.focus({ preventScroll: true })
                setOpen(false)
              }
            }}
          >
            <ul id={listId} role="listbox" aria-label={`${label} results`}>
              {results.map((place, index) => (
                <li
                  key={place.id}
                  id={`${name}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`w-full border-b border-border-subtle p-2.5 text-left text-sm text-text-primary ${index === activeIndex ? 'bg-desert-green/10' : 'hover:bg-surface-secondary'}`}
                    onMouseEnter={() => setActiveId(place.id)}
                    onClick={() => choose(place)}
                  >
                    <span className="block font-medium">{place.label}</span>
                    <span className="mt-0.5 block text-xs text-text-secondary">
                      {[place.precision, place.source].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {queryKind === 'invalid-coordinates' && (
              <p role="status" className="px-3 py-2 text-xs text-desert-red">
                Enter latitude from −90 to 90 and longitude from −180 to 180, separated by a comma.
              </p>
            )}
            {!results.length && queryKind !== 'invalid-coordinates' && (
              <p role="status" className="px-3 py-2 text-xs text-text-muted">
                Enter latitude, longitude. You can also click the map or choose a saved pin.
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
