import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, FocusEvent } from 'react'
import type { RouteStop } from '../../app/utils/map_route_points'
import {
  ROUTE_CARD_DRAG_THRESHOLD,
  ROUTE_CARD_MOTION_MS,
  routeCardDropInside,
  routeCardInsertionIndex,
  routeCardScrollSpeed,
} from '../../app/utils/map_route_card_motion'

const easing = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
type Position = { top: number; left: number }
type Session = {
  id: string
  pointerId: number
  phase: 'pending' | 'dragging' | 'settling'
  startY: number
  x: number
  y: number
  grabY: number
  height: number
  width: number
  top: number
  signature: string
  original: RouteStop[]
  order: RouteStop[]
  midpoints: number[]
  scroll: HTMLElement
  lastFrame: number
}

function scrollContainer(element: HTMLElement) {
  let parent = element.parentElement
  while (parent) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent
    parent = parent.parentElement
  }
  return element
}

/** Four keyed cards: local drag preview, native layout animation, no network dependency. */
export default function useRouteCardMotion({
  stops,
  onCommit,
  onNotice,
}: {
  stops: RouteStop[]
  onCommit: (stops: RouteStop[]) => void
  onNotice: (message: string) => void
}) {
  const listRef = useRef<HTMLOListElement | null>(null)
  const slots = useRef(new Map<string, HTMLLIElement>())
  const cards = useRef(new Map<string, HTMLDivElement>())
  const positions = useRef(new Map<string, Position>())
  const animations = useRef(new Map<string, Animation>())
  const settling = useRef<Animation | null>(null)
  const session = useRef<Session | null>(null)
  const frame = useRef<number | null>(null)
  const lastOrder = useRef('')
  const focus = useRef<{ id: string; element: HTMLElement } | null>(null)
  const latest = useRef({ stops, onCommit, onNotice })
  latest.current = { stops, onCommit, onNotice }
  const [floating, setFloating] = useState<Session | null>(null)
  const [preview, setPreview] = useState<RouteStop[] | null>(null)
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const order = preview ?? stops
  const signature = JSON.stringify(stops)

  const restoreHandle = (id: string) => {
    const handle = slots.current
      .get(id)
      ?.querySelector<HTMLButtonElement>('[data-route-drag-handle]')
    handle?.focus({ preventScroll: true })
  }

  const clearFloating = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const current = session.current
    session.current = null
    const animation = settling.current
    settling.current = null
    animation?.cancel()
    if (current) cards.current.get(current.id)?.style.removeProperty('--route-card-y')
    setFloating(null)
    setPreview(null)
    const movedHandle = current
      ? slots.current.get(current.id)?.querySelector('[data-route-drag-handle]')
      : null
    if (
      current &&
      (document.activeElement === document.body || document.activeElement === movedHandle)
    )
      restoreHandle(current.id)
  }
  const clearRef = useRef(clearFloating)
  clearRef.current = clearFloating

  const releaseCapture = (current: Session) => {
    const list = listRef.current
    if (list?.hasPointerCapture(current.pointerId)) list.releasePointerCapture(current.pointerId)
  }

  const finish = (commit: boolean) => {
    const current = session.current
    if (!current || current.phase === 'settling') return
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    if (current.phase === 'pending') {
      session.current = null
      releaseCapture(current)
      return
    }
    current.phase = 'settling'
    releaseCapture(current)
    const result = commit ? current.order : latest.current.stops
    current.signature = JSON.stringify(result)
    setPreview(null)
    setFloating({ ...current })
    if (commit && result.some((stop, index) => stop.id !== latest.current.stops[index]?.id)) {
      latest.current.onCommit(result)
      const index = result.findIndex((stop) => stop.id === current.id)
      latest.current.onNotice(`Point moved to position ${index + 1}. Calculate the route again.`)
    } else {
      latest.current.onNotice(
        commit ? 'Point returned to its original position.' : 'Reordering cancelled.'
      )
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  const tick = (time: number) => {
    const current = session.current
    const list = listRef.current
    if (!current || current.phase !== 'dragging' || !list) return
    if (!list.getClientRects().length) {
      finishRef.current(false)
      return
    }
    const viewport = current.scroll.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    const elapsed = current.lastFrame ? Math.min(32, time - current.lastFrame) : 16
    current.lastFrame = time
    if (current.x >= listRect.left && current.x <= listRect.right) {
      current.scroll.scrollTop +=
        (routeCardScrollSpeed(current.y, viewport.top, viewport.bottom) * elapsed) / 1000
    }
    const pointerY = current.y - list.getBoundingClientRect().top
    const top = pointerY - current.grabY
    current.top = top
    cards.current.get(current.id)?.style.setProperty('--route-card-y', `${top}px`)
    const previous = current.order.findIndex((stop) => stop.id === current.id)
    const next = routeCardInsertionIndex(pointerY, previous, current.midpoints)
    if (next !== previous) {
      const remaining = current.original.filter((stop) => stop.id !== current.id)
      remaining.splice(next, 0, current.original.find((stop) => stop.id === current.id)!)
      current.order = remaining
      setPreview(remaining)
    }
    frame.current = requestAnimationFrame(tickRef.current)
  }
  const tickRef = useRef(tick)
  tickRef.current = tick

  const onPointerDown = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || session.current || !listRef.current) return
    const card = cards.current.get(id)
    if (!card) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus({ preventScroll: true })
    const rect = card.getBoundingClientRect()
    const list = listRef.current
    session.current = {
      id,
      pointerId: event.pointerId,
      phase: 'pending',
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabY: event.clientY - rect.top,
      height: rect.height,
      width: rect.width,
      top: rect.top - list.getBoundingClientRect().top,
      signature,
      original: stops,
      order: stops,
      midpoints: stops
        .filter((stop) => stop.id !== id)
        .map((stop) => {
          const slot = slots.current.get(stop.id)!
          return slot.offsetTop + slot.offsetHeight / 2
        }),
      scroll: scrollContainer(list),
      lastFrame: 0,
    }
    list.setPointerCapture(event.pointerId)
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = session.current
      if (!current || event.pointerId !== current.pointerId || current.phase === 'settling') return
      event.preventDefault()
      event.stopPropagation()
      current.x = event.clientX
      current.y = event.clientY
      if (
        current.phase === 'pending' &&
        Math.abs(event.clientY - current.startY) >= ROUTE_CARD_DRAG_THRESHOLD
      ) {
        current.phase = 'dragging'
        animations.current.get(current.id)?.cancel()
        animations.current.delete(current.id)
        setFloating({ ...current })
        setPreview(current.order)
        latest.current.onNotice(
          'Moving point. Release inside the list to place it, or press Escape to cancel.'
        )
        frame.current = requestAnimationFrame(tickRef.current)
      }
    }
    const up = (event: PointerEvent) => {
      const current = session.current
      const list = listRef.current
      if (
        !current ||
        event.pointerId !== current.pointerId ||
        current.phase === 'settling' ||
        !list
      )
        return
      current.x = event.clientX
      current.y = event.clientY
      event.preventDefault()
      event.stopPropagation()
      if (current.phase === 'dragging') {
        // A quick release may arrive before the next animation frame.
        if (frame.current !== null) cancelAnimationFrame(frame.current)
        frame.current = null
        tickRef.current(performance.now())
      }
      finishRef.current(
        routeCardDropInside(
          event.clientX,
          event.clientY,
          list.getBoundingClientRect(),
          current.scroll.getBoundingClientRect()
        )
      )
    }
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === session.current?.pointerId) finishRef.current(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && session.current && session.current.phase !== 'settling') {
        event.preventDefault()
        event.stopImmediatePropagation()
        finishRef.current(false)
      }
    }
    const blur = () => finishRef.current(false)
    const visibility = () => {
      if (document.hidden) finishRef.current(false)
    }
    window.addEventListener('pointermove', move, { capture: true, passive: false })
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('lostpointercapture', cancel, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('lostpointercapture', cancel, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      const current = session.current
      session.current = null
      if (current) releaseCapture(current)
      settling.current?.cancel()
      for (const animation of animations.current.values()) animation.cancel()
    }
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      // Native <details> can change card heights without a React state change.
      for (const [id, slot] of slots.current) {
        positions.current.set(id, { top: slot.offsetTop, left: slot.offsetLeft })
      }
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const current = session.current
    if (current && current.signature !== signature) {
      // An external edit, Clear, or Reverse wins over an unfinished gesture.
      releaseCapture(current)
      clearRef.current()
      return
    }
    const key = order.map((stop) => stop.id).join('|')
    const list = listRef.current
    if (!list) return
    const listTop = list.getBoundingClientRect().top
    if (key !== lastOrder.current) {
      for (const stop of order) {
        const slot = slots.current.get(stop.id)
        if (!slot) continue
        const top = slot.offsetTop
        const left = slot.offsetLeft
        const previous = positions.current.get(stop.id)
        // Preserve the visible in-flight position when another reorder interrupts it.
        const carried = slot.getBoundingClientRect().top - listTop - top
        animations.current.get(stop.id)?.cancel()
        animations.current.delete(stop.id)
        const delta = previous ? previous.top - top + carried : 0
        if (stop.id !== floating?.id && !reduced && Math.abs(delta) > 0.5 && slot.animate) {
          const animation = slot.animate(
            [{ transform: `translate3d(0, ${delta}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
            { duration: ROUTE_CARD_MOTION_MS, easing }
          )
          animations.current.set(stop.id, animation)
          const remove = () => {
            if (animations.current.get(stop.id) === animation) animations.current.delete(stop.id)
          }
          animation.onfinish = remove
          animation.oncancel = remove
        }
        positions.current.set(stop.id, { top, left })
      }
      lastOrder.current = key
      const focused = focus.current
      if (
        focused?.element.isConnected &&
        (document.activeElement === focused.element || document.activeElement === document.body)
      ) {
        if ('disabled' in focused.element && focused.element.disabled) restoreHandle(focused.id)
        else if (document.activeElement === document.body)
          focused.element.focus({ preventScroll: true })
      }
    } else {
      for (const [id, slot] of slots.current)
        positions.current.set(id, { top: slot.offsetTop, left: slot.offsetLeft })
    }
    if (current?.phase === 'settling' && !settling.current) {
      const card = cards.current.get(current.id)
      const slot = slots.current.get(current.id)
      if (!card || !slot || reduced || !card.animate) {
        clearRef.current()
        return
      }
      const animation = card.animate(
        [
          { transform: `translate3d(0, ${current.top}px, 0) scale(1.01)` },
          { transform: `translate3d(0, ${slot.offsetTop}px, 0) scale(1)` },
        ],
        { duration: ROUTE_CARD_MOTION_MS, easing, fill: 'forwards' }
      )
      settling.current = animation
      animation.onfinish = () => {
        if (settling.current === animation) clearRef.current()
      }
    }
  })

  useEffect(() => {
    if (reduced) {
      for (const animation of animations.current.values()) animation.cancel()
      animations.current.clear()
      if (session.current?.phase === 'settling') clearRef.current()
    }
  }, [reduced])

  return {
    listRef,
    order,
    floatingId: floating?.id ?? null,
    busy: floating !== null,
    onPointerDown,
    prepareReorder: () => {
      for (const [id, slot] of slots.current) {
        positions.current.set(id, { top: slot.offsetTop, left: slot.offsetLeft })
      }
    },
    onFocusCapture: (event: FocusEvent<HTMLOListElement>) => {
      const element = event.target as HTMLElement
      const id = element.closest<HTMLElement>('[data-route-stop]')?.dataset.routeStop
      if (id) focus.current = { id, element }
    },
    slotRef: (id: string, element: HTMLLIElement | null) => {
      if (element) slots.current.set(id, element)
      else slots.current.delete(id)
    },
    cardRef: (id: string, element: HTMLDivElement | null) => {
      if (element) cards.current.set(id, element)
      else cards.current.delete(id)
    },
    slotStyle: (id: string): CSSProperties | undefined =>
      floating?.id === id ? { height: floating.height, boxSizing: 'border-box' } : undefined,
    cardStyle: (id: string): CSSProperties | undefined =>
      floating?.id === id
        ? {
            position: 'absolute',
            left: 0,
            top: 0,
            width: floating.width,
            zIndex: 20,
            transform: `translate3d(0, var(--route-card-y, ${floating.top}px), 0) scale(${reduced ? 1 : 1.01})`,
            transformOrigin: 'top center',
          }
        : undefined,
  }
}
