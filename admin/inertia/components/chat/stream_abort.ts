export interface StreamAbortRef {
  current: AbortController | null
}

export function abortActiveStream(ref: StreamAbortRef): boolean {
  const controller = ref.current
  if (!controller) return false

  // Clear ownership before aborting. The rejected stream settles asynchronously,
  // so its finally block must not be allowed to clear a replacement controller.
  ref.current = null
  controller.abort()
  return true
}

export function clearStreamIfCurrent(ref: StreamAbortRef, controller: AbortController): boolean {
  if (ref.current !== controller) return false

  ref.current = null
  return true
}
