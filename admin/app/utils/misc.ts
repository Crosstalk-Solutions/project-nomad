export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Decide which model runs an ancillary AI task (chat titles, chat suggestions).
 *
 * `configured` is the user's `ai.tasksModel` setting. It only wins when the
 * model is still installed — a model can be deleted from /settings/models long
 * after it was picked here, and a request for a missing model 404s. In every
 * other case the caller's existing `fallback` applies, so an unset setting
 * leaves prior behaviour untouched.
 */
export function pickTasksModel(
  configured: string | null | undefined,
  installedNames: string[],
  fallback: string | null
): { model: string | null; staleConfigured: string | null } {
  const trimmed = configured?.trim()
  if (!trimmed) {
    return { model: fallback, staleConfigured: null }
  }
  if (installedNames.includes(trimmed)) {
    return { model: trimmed, staleConfigured: null }
  }
  return { model: fallback, staleConfigured: trimmed }
}

export function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    return lower === 'true' || lower === '1'
  }
  if (typeof value === 'number') {
    return value === 1
  }
  return false
}