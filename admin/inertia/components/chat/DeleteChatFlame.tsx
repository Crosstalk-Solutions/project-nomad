import { IconFlame } from '@tabler/icons-react'
import classNames from '~/lib/classNames'
import { DELETE_CHAT_LABEL } from './delete_chat'

interface DeleteChatFlameProps {
  active: boolean
  disabled?: boolean
  onDelete: () => void
}

/**
 * Outlined flame for one saved chat. The icon is a stroke SVG (Tabler
 * IconFlame), drawn after the title. Activating it asks for confirmation; it
 * does not delete on the first press.
 */
export default function DeleteChatFlame({
  active,
  disabled = false,
  onDelete,
}: DeleteChatFlameProps) {
  return (
    <span className="group/delete relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={DELETE_CHAT_LABEL}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (disabled) return
          onDelete()
        }}
        className={classNames(
          'inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-md transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-40',
          active
            ? 'text-white hover:bg-white/15 focus-visible:ring-white focus-visible:ring-offset-desert-green'
            : 'text-text-muted hover:bg-surface-primary hover:text-desert-orange focus-visible:ring-desert-green focus-visible:ring-offset-surface-secondary'
        )}
      >
        <IconFlame className="h-5 w-5" stroke={2} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute right-full top-1/2 z-20 mr-1 -translate-y-1/2 whitespace-nowrap rounded-md bg-desert-stone-dark px-2 py-1 text-xs text-white opacity-0 shadow-lg group-hover/delete:opacity-100 group-focus-within/delete:opacity-100"
      >
        {DELETE_CHAT_LABEL}
      </span>
    </span>
  )
}
