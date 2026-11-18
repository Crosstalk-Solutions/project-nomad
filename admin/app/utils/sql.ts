/**
 * Escape LIKE wildcards so user input matches literally. Relies on MySQL's
 * default LIKE escape character (backslash); the value must go in as a bound
 * parameter, where the driver keeps the backslash intact.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

/** True for a MySQL duplicate-key error (UNIQUE constraint race). */
export function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: unknown; errno?: unknown } | null
  return e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062
}
