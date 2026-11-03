import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import classNames from '~/lib/classNames'
import { copyToClipboard } from '~/lib/clipboard'

type CopyState = 'idle' | 'copied' | 'failed'

export interface ChatCopyButtonProps {
  /** Text to copy, read at click time. */
  getText: () => string
  /** Accessible name for the idle state, e.g. "Copy answer". */
  label: string
  className?: string
}

/**
 * Small Copy button used under assistant answers and on fenced code blocks
 * (#1376). Shows a brief "Copied" confirmation, or "Copy failed" when neither
 * the Clipboard API nor the execCommand fallback worked, so the user is never
 * left believing something is on the clipboard when it isn't.
 */
export default function ChatCopyButton({ getText, label, className }: ChatCopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const handleClick = async () => {
    const ok = await copyToClipboard(getText())
    setState(ok ? 'copied' : 'failed')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={state === 'idle' ? label : undefined}
      className={classNames(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-desert-green',
        className
      )}
    >
      {state === 'copied' ? (
        <IconCheck className="size-3.5" aria-hidden="true" />
      ) : (
        <IconCopy className="size-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
      </span>
    </button>
  )
}
