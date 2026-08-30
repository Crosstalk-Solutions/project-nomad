import { MARKER_ICONS } from './marker_icons'

type IconSelectorPopoverProps = {
  selectedIcon?: string | null
  onSelect: (iconName: string) => void
  onClose: () => void
}

/**
 * The marker icon picker: the whole curated set, six across and six down.
 *
 * No search box and no paging, because there is nothing to search or page
 * through -- 36 icons fit on screen at once, which is the point of curating
 * them. See marker_icons.ts for why the set is a hand-written list.
 */
export default function IconSelectorPopover({
  selectedIcon,
  onSelect,
  onClose,
}: IconSelectorPopoverProps) {
  return (
    <div
      className="absolute left-0 top-7 z-50 rounded-md border border-border-subtle bg-surface-primary p-2 shadow-lg"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-6 gap-1">
        {MARKER_ICONS.map(({ name, label, Icon }) => (
          <button
            key={name}
            type="button"
            title={label}
            aria-label={label}
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
