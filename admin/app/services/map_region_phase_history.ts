import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  MapRegionComponent,
  MapRegionOperation,
  MapRegionSourceFormat,
} from '../../types/map_regions.js'

interface PhaseSample {
  component: MapRegionComponent
  phase: string
  detail: string
  format: MapRegionSourceFormat
  sourceBytes: number
  durationSeconds: number
  completedAt: number
}
const supported = new Set([
  'verifying_source',
  'reading_source',
  'building_search',
  'building_routing',
  'validating',
  'publishing',
])
const cached = new Map<string, { at: number; samples: PhaseSample[] }>()
const valid = (value: PhaseSample) =>
  supported.has(value.phase) &&
  ['search', 'routing'].includes(value.component) &&
  ['osm-pbf', 'cnefe-zip'].includes(value.format) &&
  value.sourceBytes > 0 &&
  Number.isFinite(value.sourceBytes) &&
  value.durationSeconds >= 1 &&
  value.durationSeconds <= 86400 &&
  Number.isFinite(value.completedAt)

/** Local measurements only. No source data, names or network calls are stored. */
export class MapRegionPhaseHistory {
  private directory: string
  constructor(
    root: string,
    private clock = Date.now
  ) {
    this.directory = join(root, 'phase-history')
  }

  async transition(
    component: MapRegionComponent,
    previous: MapRegionOperation | undefined,
    next: MapRegionOperation
  ) {
    if (
      !previous ||
      previous.id !== next.id ||
      previous.telemetry !== 'reported' ||
      !supported.has(previous.phase) ||
      !previous.phaseStartedAt ||
      (previous.phase === next.phase && previous.detail === next.detail) ||
      ['failed', 'cancelled', 'cancelling', 'queued', 'status_unavailable'].includes(next.phase)
    )
      return
    const sample: PhaseSample = {
      component,
      phase: previous.phase,
      detail: previous.detail || '',
      format: previous.sourceFormat!,
      sourceBytes: previous.sourceBytes!,
      durationSeconds: (this.clock() - Date.parse(previous.phaseStartedAt)) / 1000,
      completedAt: this.clock(),
    }
    if (!valid(sample)) return
    const identity = createHash('sha256')
      .update([previous.id, previous.phase, previous.detail, previous.phaseStartedAt].join('|'))
      .digest('hex')
    await mkdir(this.directory, { recursive: true })
    const path = join(this.directory, identity + '.json')
    const temporary = path + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temporary, JSON.stringify(sample))
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true })
    }
    cached.delete(this.directory)
    const names = (await readdir(this.directory)).filter((name) =>
      /^[a-f0-9]{64}\.json$/.test(name)
    )
    if (names.length > 256) {
      const entries = await Promise.all(
        names.map(async (name) => ({ name, at: (await stat(join(this.directory, name))).mtimeMs }))
      )
      entries.sort((a, b) => b.at - a.at)
      await Promise.all(
        entries.slice(256).map((item) => rm(join(this.directory, item.name), { force: true }))
      )
    }
  }

  private async samples() {
    const prior = cached.get(this.directory)
    if (prior && this.clock() - prior.at < 30000) return prior.samples
    const names = (await readdir(this.directory).catch(() => [] as string[]))
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .slice(-256)
    const samples = (
      await Promise.all(
        names.map((name) =>
          readFile(join(this.directory, name), 'utf8')
            .then((value) => JSON.parse(value) as PhaseSample)
            .catch(() => undefined)
        )
      )
    ).filter((value): value is PhaseSample => !!value && valid(value))
    cached.set(this.directory, { at: this.clock(), samples })
    return samples
  }

  async estimate(component: MapRegionComponent, operation: MapRegionOperation) {
    delete operation.phaseEtaMinSeconds
    delete operation.phaseEtaMaxSeconds
    delete operation.etaBasis
    delete operation.etaSamples
    if (!supported.has(operation.phase) || operation.activity !== 'active') return
    const counters = [
      [operation.stageBytesProcessed, operation.stageTotalBytes, operation.stageRateBytesPerSecond],
      [operation.recordsProcessed, operation.recordsTotal, operation.recordsPerSecond],
    ]
    for (const [done, total, rate] of counters) {
      if (
        done !== undefined &&
        total &&
        rate &&
        rate > 0 &&
        done >= 0 &&
        done < total &&
        operation.lastProgressAt &&
        this.clock() - Date.parse(operation.lastProgressAt) < 15000
      ) {
        const seconds = (total - done) / rate
        operation.phaseEtaMinSeconds = Math.max(0, Math.floor(seconds * 0.8))
        operation.phaseEtaMaxSeconds = Math.max(1, Math.ceil(seconds * 1.25))
        operation.etaBasis = 'measured'
        return
      }
    }
    if (
      !operation.phaseStartedAt ||
      !operation.sourceFormat ||
      !operation.sourceBytes ||
      operation.sourceBytes <= 0 ||
      operation.telemetry !== 'reported'
    )
      return
    const comparable = (await this.samples()).filter(
      (sample) =>
        sample.component === component &&
        sample.phase === operation.phase &&
        sample.detail === (operation.detail || '') &&
        sample.format === operation.sourceFormat &&
        sample.sourceBytes >= operation.sourceBytes! / 2 &&
        sample.sourceBytes <= operation.sourceBytes! * 2
    )
    if (comparable.length < 3) return
    const predictions = comparable
      .map((sample) => (sample.durationSeconds * operation.sourceBytes!) / sample.sourceBytes)
      .sort((a, b) => a - b)
    const elapsed = (this.clock() - Date.parse(operation.phaseStartedAt)) / 1000
    if (!Number.isFinite(elapsed) || elapsed < 0) return
    const lower = predictions[Math.floor((predictions.length - 1) * 0.2)] * 0.7
    const upper = predictions[Math.ceil((predictions.length - 1) * 0.8)] * 1.4
    // Once this phase outlives the observed range, withdraw the prediction instead
    // of leaving "0 seconds remaining" on an operation that is still working.
    if (elapsed >= upper) return
    operation.phaseEtaMinSeconds = Math.max(0, Math.floor(lower - elapsed))
    operation.phaseEtaMaxSeconds = Math.max(1, Math.ceil(upper - elapsed))
    operation.etaBasis = 'history'
    operation.etaSamples = comparable.length
  }
}
