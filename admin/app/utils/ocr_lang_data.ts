import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Where tesseract.js finds its English model (#1457).
 *
 * Left to its defaults, tesseract.js downloads `eng.traineddata.gz` from a CDN
 * the first time a worker starts and caches it in the working directory, which
 * inside the container is the image layer: every update throws the cache
 * away, and an install with no internet, the case NOMAD exists for, never gets
 * it at all. The model ships as the npm package `@tesseract.js-data/eng`
 * instead, so it is in the image with the rest of node_modules and the worker
 * reads it from disk every time.
 *
 * `4.0.0_best_int` is the LSTM-only variant tesseract.js selects by default
 * (OEM.DEFAULT without `legacyLang`); the full `4.0.0` set is for the legacy
 * engine, which NOMAD does not enable.
 */
export const TESSERACT_LANG_DATA_PACKAGE = '@tesseract.js-data/eng'
export const TESSERACT_LANG_DATA_VARIANT = '4.0.0_best_int'

export function resolveTesseractLangPath(): string {
  const require = createRequire(import.meta.url)
  const packageEntry = require.resolve(TESSERACT_LANG_DATA_PACKAGE)
  return join(dirname(packageEntry), TESSERACT_LANG_DATA_VARIANT)
}

/** Worker options that read the bundled model and never touch the network or the working directory. */
export function tesseractWorkerOptions(): { langPath: string; cacheMethod: 'none'; gzip: true } {
  return { langPath: resolveTesseractLangPath(), cacheMethod: 'none', gzip: true }
}
