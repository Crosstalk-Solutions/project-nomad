import type { BenchmarkType } from '../../types/benchmark'

/**
 * How a benchmark result's headline score should be presented. A partial run
 * (System Only / AI Only) is NOT the NOMAD Score -- the NOMAD Score is the full
 * benchmark composite -- so partial results are relabelled and flagged to avoid
 * users mistaking a partial number for their NOMAD Score. The stored score for
 * a partial run is already renormalized to that category's own 0-100 range
 * (see BenchmarkService._calculateNomadScore).
 */
export function getScoreDisplay(type: BenchmarkType): {
  label: string
  isPartial: boolean
  /** Which full benchmark to run to get the real NOMAD Score, for the CTA copy. */
  cta: string
} {
  switch (type) {
    case 'system':
      return {
        label: 'System Score',
        isPartial: true,
        cta: 'This is a partial result, not your NOMAD Score. Run a Full Benchmark to get your NOMAD Score.',
      }
    case 'ai':
      return {
        label: 'AI Score',
        isPartial: true,
        cta: 'This is a partial result, not your NOMAD Score. Run a Full Benchmark to get your NOMAD Score.',
      }
    default:
      return { label: 'NOMAD Score', isPartial: false, cta: '' }
  }
}
