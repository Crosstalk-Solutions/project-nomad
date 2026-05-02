import { useMemo, useState } from 'react'
import * as TablerIcons from '@tabler/icons-react'
import type { IconProps } from '@tabler/icons-react'
import type { ComponentType } from 'react'

const PAGE_SIZE = 48

type IconSelectorPopoverProps = {
  selectedIcon?: string | null
  onSelect: (iconName: string) => void
  onClose: () => void
}

const iconEntries = Object.entries(TablerIcons)
  .filter(([name, value]) => {
    return (
      name.startsWith('Icon') &&
      name !== 'Icon' &&
      value !== null &&
      (typeof value === 'function' || typeof value === 'object')
    )
  })
  .sort(([a], [b]) => a.localeCompare(b)) as Array<[string, ComponentType<IconProps>]>

export default function IconSelectorPopover({
                                              selectedIcon,
                                              onSelect,
                                              onClose,
                                            }: IconSelectorPopoverProps) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filteredIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return iconEntries.filter(([name]) => name.toLowerCase().includes(normalizedQuery))
  }, [query])

  const pageCount = Math.max(1, Math.ceil(filteredIcons.length / PAGE_SIZE))

  const pagedIcons = filteredIcons.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div
      className="absolute left-0 top-7 z-50 w-72 rounded-md border border-border-subtle bg-surface-primary p-2 shadow-lg"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        type="search"
        placeholder="Search icons..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setPage(0)
        }}
        className="mb-2 block w-full rounded border border-border-default bg-surface-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:border-desert-green focus:outline-none"
      />

      <div className="max-h-56 overflow-y-auto themed-scrollbar">
        <div className="grid grid-cols-6 gap-1">
          {pagedIcons.map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={name}
              onClick={() => {
                onSelect(name)
                onClose()
              }}
              className={`flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-surface-secondary ${
                selectedIcon === name ? 'bg-desert-green text-white' : 'text-text-secondary'
              }`}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(0, prev - 1))}
          disabled={page === 0}
          className="rounded bg-[#424420] px-2 py-1 text-xs text-white hover:bg-[#525530] disabled:opacity-40"
        >
          Prev
        </button>

        <span className="text-xs text-text-muted">
          {filteredIcons.length === 0 ? 'No icons' : `${page + 1} / ${pageCount}`}
        </span>

        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
          disabled={page >= pageCount - 1}
          className="rounded bg-[#424420] px-2 py-1 text-xs text-white hover:bg-[#525530] disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-[#424420] px-2 py-1 text-xs text-white hover:bg-[#525530]"
        >
          Close
        </button>
      </div>
    </div>
  )
}
