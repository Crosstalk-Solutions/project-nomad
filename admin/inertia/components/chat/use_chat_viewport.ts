import { useEffect, useRef } from 'react'

export default function useChatViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    const element = ref.current
    if (!enabled || !viewport || !element) return

    // On mobile, the keyboard can resize the visual viewport alone.
    const update = () => {
      element.style.setProperty('--chat-viewport-height', `${viewport.height}px`)
      element.style.setProperty('--chat-viewport-top', `${viewport.offsetTop}px`)
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [enabled])

  return ref
}
