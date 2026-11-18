/**
 * Whether an `execFile` rejection means the child was killed by our `timeout`
 * option rather than exiting with an error of its own.
 *
 * stderr cannot tell the two apart: a child that buffers its output (pmtiles
 * does) loses it on SIGTERM, so a timed-out run and a run that never started can
 * both come back with an empty stderr. Node marks the timeout case with
 * `killed: true` plus the kill signal, and leaves `code` null (#1258).
 */
export function isExecTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { killed?: unknown; signal?: unknown; code?: unknown }
  return e.killed === true && typeof e.signal === 'string' && (e.code === null || e.code === undefined)
}
