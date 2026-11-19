import axios from 'axios'
import logger from '@adonisjs/core/services/logger'
import KVStore from '#models/kv_store'
import CustomLibrarySource from '#models/custom_library_source'
import { DOWNLOAD_HEADERS } from '../utils/downloads.js'
import {
  CANONICAL_ZIM_BASE_URL,
  canonicalZimRelativePath,
  isMeasurementFresh,
  parseMirrorMeasurement,
  parseMirrorOverride,
  pickFastestMirror,
  resolveZimMirror,
  rewriteZimUrlToMirror,
  type MirrorProbeResult,
  type ResolvedZimMirror,
  type ZimMirrorMeasurement,
  type ZimMirrorOverride,
  type ZimMirrorSource,
} from '../utils/zim_mirror.js'

/** Bytes requested per probe (a Range GET of the file being downloaded). */
const PROBE_BYTES = 2 * 1024 * 1024
/** Hard cap per source; 6 sources sequentially bounds a full probe to ~24s. */
const PROBE_TIMEOUT_MS = 4000
/** Below this the timing is mostly connection setup and says nothing about throughput. */
const MIN_PROBE_BYTES = 64 * 1024

/**
 * Chooses the host ZIM bytes are fetched from (#1115). See utils/zim_mirror.ts
 * for the precedence rule and why the canonical URL stays the download's
 * identity.
 *
 * `resolveDownloadUrl` is the single entry point: RunDownloadJob calls it for
 * every ZIM job, so curated tiers, Wikipedia, Easy Setup, content updates
 * (manual and auto), retries and catalog downloads from the Content Explorer all
 * agree on the source without any of their dispatch sites knowing about mirrors.
 *
 * The speed probe runs only when no override is set and the cached measurement
 * is missing or stale (7 days; 1 day after a probe where nothing answered), so it
 * is a one-off cost in front of a background download, never per download.
 * Every failure path degrades to the canonical URL.
 */
export class ZimMirrorService {
  /** Concurrent ZIM jobs share one probe instead of each running their own. */
  private static inflightProbe: Promise<ZimMirrorMeasurement | null> | null = null

  async resolveDownloadUrl(url: string): Promise<{ url: string } & ResolvedZimMirror> {
    // Cheap pre-check so non-Kiwix downloads never touch the DB.
    if (!canonicalZimRelativePath(url)) return { url, baseUrl: null, reason: 'default' }

    try {
      const override = parseMirrorOverride(await KVStore.getValue('zim.downloadMirror'))
      const sources = await this.listSources()
      let measurement = parseMirrorMeasurement(await KVStore.getValue('zim.mirrorMeasurement'))

      let resolved = resolveZimMirror({ override, measurement, sources })
      if (resolved.reason !== 'override' && !isMeasurementFresh(measurement, Date.now())) {
        measurement = (await this.probe(url)) ?? measurement
        resolved = resolveZimMirror({ override, measurement, sources })
      }

      return { url: rewriteZimUrlToMirror(url, resolved.baseUrl), ...resolved }
    } catch (error) {
      logger.warn(
        `[ZimMirrorService] Could not resolve a mirror, using canonical source: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      return { url, baseUrl: null, reason: 'default' }
    }
  }

  async getStatus() {
    const override = parseMirrorOverride(await KVStore.getValue('zim.downloadMirror'))
    const measurement = parseMirrorMeasurement(await KVStore.getValue('zim.mirrorMeasurement'))
    const sources = await this.listSources()
    return {
      override,
      measurement,
      effective: resolveZimMirror({ override, measurement, sources }),
      canonicalBaseUrl: CANONICAL_ZIM_BASE_URL,
    }
  }

  async setOverride(value: ZimMirrorOverride): Promise<void> {
    if (value !== 'auto' && value !== 'canonical') {
      const exists = await CustomLibrarySource.find(Number(value))
      if (!exists) throw new Error('Download source not found')
    }
    await KVStore.setValue('zim.downloadMirror', value)
  }

  /** Forget the cached measurement so the next ZIM download re-probes. */
  async clearMeasurement(): Promise<void> {
    await KVStore.clearValue('zim.mirrorMeasurement')
  }

  private async listSources(): Promise<(ZimMirrorSource & { is_default: boolean })[]> {
    const rows = await CustomLibrarySource.all()
    return rows.map((r) => ({ id: r.id, base_url: r.base_url, is_default: !!r.is_default }))
  }

  private probe(probeUrl: string): Promise<ZimMirrorMeasurement | null> {
    if (!ZimMirrorService.inflightProbe) {
      ZimMirrorService.inflightProbe = this.runProbe(probeUrl).finally(() => {
        ZimMirrorService.inflightProbe = null
      })
    }
    return ZimMirrorService.inflightProbe
  }

  /**
   * Times a small Range GET of the file about to be downloaded against the
   * canonical host and each built-in mirror. Using the real file (rather than a
   * fixed test file, which would rotate away with Kiwix's dated filenames) also
   * means a mirror that hasn't synced it yet scores as failed instead of winning.
   * Sources run one at a time so they don't compete for the same uplink.
   * User-added libraries are not probed (they may not mirror the Kiwix tree);
   * pick one explicitly via the override instead.
   */
  private async runProbe(probeUrl: string): Promise<ZimMirrorMeasurement | null> {
    try {
      const allSources = await this.listSources()
      const sources = allSources.filter((s) => s.is_default)
      const candidates = [CANONICAL_ZIM_BASE_URL, ...sources.map((s) => s.base_url)]

      const results: MirrorProbeResult[] = []
      for (const baseUrl of candidates) {
        const target =
          baseUrl === CANONICAL_ZIM_BASE_URL ? probeUrl : rewriteZimUrlToMirror(probeUrl, baseUrl)
        results.push({ baseUrl, bytesPerSecond: await this.measureThroughput(target) })
      }

      const measurement: ZimMirrorMeasurement = {
        baseUrl: pickFastestMirror(results),
        measuredAt: new Date().toISOString(),
        results,
      }
      await KVStore.setValue('zim.mirrorMeasurement', JSON.stringify(measurement))
      logger.info(
        `[ZimMirrorService] Mirror probe: ${results
          .map(
            (r) =>
              `${r.baseUrl}=${r.bytesPerSecond ? `${(r.bytesPerSecond / 1e6).toFixed(1)}MB/s` : 'failed'}`
          )
          .join(', ')} -> ${measurement.baseUrl ?? 'none (using canonical)'}`
      )
      return measurement
    } catch (error) {
      logger.warn(
        `[ZimMirrorService] Mirror probe failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }

  private async measureThroughput(url: string): Promise<number | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const startedAt = Date.now()
    let bytes = 0
    try {
      const response = await axios.get(url, {
        responseType: 'stream',
        headers: { ...DOWNLOAD_HEADERS, Range: `bytes=0-${PROBE_BYTES - 1}` },
        signal: controller.signal,
        timeout: PROBE_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: (status) => status === 200 || status === 206,
      })
      await new Promise<void>((resolve) => {
        const stream = response.data
        // A server that ignores Range sends the whole multi-GB file, so stop
        // reading once we have enough; the timeout covers a slow trickle.
        stream.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes >= PROBE_BYTES) {
            stream.destroy()
            resolve()
          }
        })
        stream.on('end', () => resolve())
        stream.on('close', () => resolve())
        stream.on('error', () => resolve())
      })
    } catch {
      // Unreachable, non-2xx, or aborted before the body started: falls through
      // to the byte check below.
    } finally {
      clearTimeout(timer)
    }

    if (bytes < MIN_PROBE_BYTES) return null
    const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
    return bytes / seconds
  }
}
