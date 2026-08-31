import DynamicIcon, { DynamicIconName } from './DynamicIcon'
import { LINK_TILE_ICONS } from '../../constants/link_tile_icons'

type LinkTileIconPickerProps = {
  value: string | null
  onChange: (icon: string) => void
}

/**
 * The whole curated icon set, six across and six down.
 *
 * No search box and no paging: 36 icons fit on screen at once, which is the
 * point of curating them rather than offering a library. The grid needs an
 * explicit width, because a shrink-wrapped container collapses the six 1fr
 * columns and the glyphs overlap into an unreadable smear.
 */
export default function LinkTileIconPicker({ value, onChange }: LinkTileIconPickerProps) {
  return (
    <div className="w-72 rounded border border-border-default bg-surface-primary p-2">
      <div className="grid grid-cols-6 justify-items-center gap-1">
        {LINK_TILE_ICONS.map((name) => (
          <button
            key={name}
            type="button"
            title={name.replace(/^Icon/, '')}
            aria-label={name.replace(/^Icon/, '')}
            aria-pressed={value === name}
            onClick={() => onChange(name)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded transition-colors ${
              value === name
                ? 'bg-desert-green text-white'
                : 'text-text-secondary hover:bg-surface-secondary'
            }`}
          >
            <DynamicIcon icon={name as DynamicIconName} className="!size-5" />
          </button>
        ))}
      </div>
    </div>
  )
}
