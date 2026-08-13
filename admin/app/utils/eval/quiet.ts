import logger from '@adonisjs/core/services/logger'

/**
 * Turn down the application logger for the duration of an eval run.
 *
 * RagService logs every keyword extraction, every batch, and the text of every
 * chunk at debug level. That is the right default for diagnosing an ingest, and
 * completely wrong for a tool whose entire output is a score table — the
 * numbers scroll off the top of the terminal before you can read them.
 *
 * Returns a restore function so the level is put back even if the caller throws.
 * Pass `debug: true` (from `--debug`) to leave the logger alone when you are
 * actually trying to see the pipeline internals.
 */
export function quietLogging(debug = false): () => void {
  if (debug) return () => {}
  const previous = logger.level
  logger.level = 'warn'
  return () => {
    logger.level = previous
  }
}
