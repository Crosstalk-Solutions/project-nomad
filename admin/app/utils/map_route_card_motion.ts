export const ROUTE_CARD_MOTION_MS = 220
export const ROUTE_CARD_DRAG_THRESHOLD = 5

/** Compare the pointer's list-relative Y with fixed drag-start midpoints.
 * Using the pointer, rather than the dragged card's center, also works when a
 * tall expanded card is grabbed by its top handle and moved above a short one.
 */
export function routeCardInsertionIndex(
  pointerY: number,
  current: number,
  otherMidpoints: number[],
  hysteresis = 6
) {
  if (!Number.isFinite(pointerY)) return current
  let next = current
  while (next < otherMidpoints.length && pointerY > otherMidpoints[next] + hysteresis) next++
  while (next > 0 && pointerY < otherMidpoints[next - 1] - hysteresis) next--
  return next
}

/** Pixels per second; the middle of the scroll container remains still. */
export function routeCardScrollSpeed(y: number, top: number, bottom: number) {
  const edge = Math.min(48, Math.max(0, (bottom - top) / 3))
  if (!edge || y < top || y > bottom) return 0
  if (y < top + edge) return -420 * (1 - (y - top) / edge)
  if (y > bottom - edge) return 420 * (1 - (bottom - y) / edge)
  return 0
}

export function routeCardDropInside(
  x: number,
  y: number,
  list: { left: number; right: number; top: number; bottom: number },
  viewport: { top: number; bottom: number }
) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= list.left &&
    x <= list.right &&
    y >= Math.max(list.top, viewport.top) &&
    y <= Math.min(list.bottom, viewport.bottom)
  )
}
