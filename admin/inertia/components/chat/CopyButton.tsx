import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconCopy, IconX } from '@tabler/icons-react'
import classNames from '~/lib/classNames'
import { copyToClipboard } from '~/lib/clipboard'

export interface CopyButtonProps {
  // Called on click so the text is read at copy time (e.g. a code block's DOM text).
  getText: () => string
  label?: string
  className?: string
}

type CopyState = 'idle' | 'copied' | 'failed'

export default function CopyButton({ getText, label = 'Copy', className }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  const handleClick = async () => {
    const ok = await copyToClipboard(getText())
    setState(ok ? 'copied' : 'failed')
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setState('idle'), 2000)
  }

  const Icon = state === 'copied' ? IconCheck : state === 'failed' ? IconX : IconCopy
  const text = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label

  return (
    <button
      type="button"
      onClick={handleClick}
      className={classNames(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-desert-green',
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span aria-live="polite">{text}</span>
    </button>
  )
}
