/**
 * Report shape, baseline diffing, and the gate decision.
 *
 * Pure functions over plain objects — the service layer does the file I/O. The
 * comparison logic in particular has to be testable without a filesystem,
 * because it is the piece that decides whether a pull request is blocked.
 */

export type ReportKind = 'retrieval' | 'generation'

/**
 * Provenance. Every field here exists to answer "is this report comparable to
 * that one?", and `corpusFingerprint` is the one that can veto the comparison
 * outright.
 */
export type ReportMeta = {
  kind: ReportKind
  createdAt: string
  corpusFingerprint: string
  gitSha: string | null
  gitBranch: string | null
  gitDirty: boolean
  nomadVersion: string | null
  /** Host platform. Recorded for context; never used to justify a score. */
  platform: {
    cpuArchitecture: string | null
    osName: string | null
    nodeVersion: string
  }
  params: Record<string, unknown>
}

/**
 * A report is metadata plus a flat bag of named metrics plus the per-case
 * detail. Flattening the metrics is deliberate: it means the diff logic does
 * not need to know anything about retrieval versus generation, so adding a
 * metric later requires no change to the comparison or the gate.
 */
export type EvalReport = {
  meta: ReportMeta
  /** metric name -> value. null means "not measurable in this run". */
  metrics: Record<string, number | null>
  /** tag -> metric name -> value. */
  byTag: Record<string, Record<string, number | null>>
  /** Per-question detail, for the "what did it actually say" question. */
  cases: unknown[]
}

/**
 * Whether a metric going up is good.
 *
 * Without this the diff cannot tell an improvement from a regression, and a
 * leakage rate falling to zero would be reported as a failure.
 */
export type MetricDirection = 'higher-is-better' | 'lower-is-better'

export const METRIC_DIRECTIONS: Record<string, MetricDirection> = {
  // retrieval
  'recall@1': 'higher-is-better',
  'recall@3': 'higher-is-better',
  'recall@5': 'higher-is-better',
  'recall@10': 'higher-is-better',
  'hitRate@1': 'higher-is-better',
  'hitRate@3': 'higher-is-better',
  'hitRate@5': 'higher-is-better',
  'hitRate@10': 'higher-is-better',
  'precision@1': 'higher-is-better',
  'precision@3': 'higher-is-better',
  'precision@5': 'higher-is-better',
  'precision@10': 'higher-is-better',
  'ndcg@1': 'higher-is-better',
  'ndcg@3': 'higher-is-better',
  'ndcg@5': 'higher-is-better',
  'ndcg@10': 'higher-is-better',
  mrr: 'higher-is-better',
  emptyRateOnAnswerable: 'lower-is-better',
  nonEmptyRateOnRefusal: 'lower-is-better',
  // generation
  correctness: 'higher-is-better',
  refusalCorrectness: 'higher-is-better',
  leakageRate: 'lower-is-better',
  thinkTagLeakRate: 'lower-is-better',
  markdownRate: 'higher-is-better',
  groundedness: 'higher-is-better',
}

export type MetricDelta = {
  metric: string
  baseline: number | null
  current: number | null
  delta: number | null
  direction: MetricDirection
  /** Signed so that positive always means "better", whatever the direction. */
  improvement: number | null
  regressed: boolean
  /** Present in one report but not the other. */
  onlyIn?: 'baseline' | 'current'
}

export type ComparisonResult = {
  comparable: boolean
  /** Why the comparison was refused, when it was. */
  incomparableReason?: string
  tolerance: number
  deltas: MetricDelta[]
  regressions: MetricDelta[]
  improvements: MetricDelta[]
}

/**
 * Default tolerance band.
 *
 * Not zero, on purpose. Even at temperature 0 the generation tier moves a
 * little between runs, and a gate that fires on 0.001 gets switched off within
 * a week. 0.02 is roughly "one question in fifty" on a 99-question set — small
 * enough to catch a real regression, large enough to ignore a coin flip.
 */
export const DEFAULT_TOLERANCE = 0.02

/**
 * Slack for floating-point representation error at the tolerance boundary.
 *
 * Without it, `0.9 - 0.02` evaluates to a delta of -0.020000000000000018, which
 * is "greater than the tolerance" by 1.8e-17 and would block a pull request. A
 * gate that fires on the last bit of a double is a gate people learn to ignore.
 */
const BOUNDARY_EPSILON = 1e-9

export function compareReports(
  baseline: EvalReport,
  current: EvalReport,
  tolerance: number = DEFAULT_TOLERANCE
): ComparisonResult {
  if (baseline.meta.kind !== current.meta.kind) {
    return incomparable(
      `cannot compare a ${baseline.meta.kind} report against a ${current.meta.kind} report`,
      tolerance
    )
  }

  // The hard veto. Different corpora, chunk sizes, or embedding models mean the
  // two numbers were produced by different experiments, and diffing them would
  // manufacture a regression (or hide one) out of nothing.
  if (baseline.meta.corpusFingerprint !== current.meta.corpusFingerprint) {
    return incomparable(
      `corpus fingerprint changed (${baseline.meta.corpusFingerprint} -> ${current.meta.corpusFingerprint}). ` +
        'The corpus, chunk size, or embedding model differs, so these runs are not measuring the same thing. Re-baseline instead.',
      tolerance
    )
  }

  const names = [...new Set([...Object.keys(baseline.metrics), ...Object.keys(current.metrics)])].sort()
  const deltas: MetricDelta[] = names.map((metric) => {
    const b = baseline.metrics[metric] ?? null
    const c = current.metrics[metric] ?? null
    const direction = METRIC_DIRECTIONS[metric] ?? 'higher-is-better'
    const onlyIn =
      !(metric in baseline.metrics) ? ('current' as const)
      : !(metric in current.metrics) ? ('baseline' as const)
      : undefined

    if (b === null || c === null) {
      return { metric, baseline: b, current: c, delta: null, direction, improvement: null, regressed: false, onlyIn }
    }

    const delta = c - b
    const improvement = direction === 'higher-is-better' ? delta : -delta
    return {
      metric,
      baseline: b,
      current: c,
      delta,
      direction,
      improvement,
      regressed: improvement < -(tolerance + BOUNDARY_EPSILON),
      onlyIn,
    }
  })

  return {
    comparable: true,
    tolerance,
    deltas,
    regressions: deltas.filter((d) => d.regressed),
    improvements: deltas.filter(
      (d) => d.improvement !== null && d.improvement > tolerance + BOUNDARY_EPSILON
    ),
  }
}

function incomparable(reason: string, tolerance: number): ComparisonResult {
  return {
    comparable: false,
    incomparableReason: reason,
    tolerance,
    deltas: [],
    regressions: [],
    improvements: [],
  }
}

/** Flatten a `Record<number, number|null>` into `name@k` keys. */
export function flattenByK(
  prefix: string,
  values: Record<number, number | null>
): Record<string, number | null> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [`${prefix}@${k}`, v]))
}

const pct = (v: number | null) => (v === null ? 'n/a' : v.toFixed(4))

/** Human-readable summary, worst regressions first. */
export function renderComparisonMarkdown(
  baselinePath: string,
  currentPath: string,
  result: ComparisonResult
): string {
  const lines: string[] = ['# Eval comparison', '']
  lines.push(`- baseline: \`${baselinePath}\``)
  lines.push(`- current:  \`${currentPath}\``)
  lines.push(`- tolerance: ${result.tolerance}`)
  lines.push('')

  if (!result.comparable) {
    lines.push('## Not comparable', '', result.incomparableReason ?? 'unknown reason', '')
    return lines.join('\n')
  }

  lines.push(
    result.regressions.length > 0
      ? `## ${result.regressions.length} regression(s)`
      : '## No regressions'
  )
  lines.push('')
  lines.push('| metric | baseline | current | delta | verdict |')
  lines.push('|---|---:|---:|---:|---|')

  // Worst first — the thing a developer needs is at the top, not sorted
  // alphabetically halfway down a wall of unchanged rows.
  const ordered = [...result.deltas].sort((a, b) => (a.improvement ?? 0) - (b.improvement ?? 0))
  for (const d of ordered) {
    const verdict =
      d.onlyIn === 'current' ? 'new'
      : d.onlyIn === 'baseline' ? 'removed'
      : d.delta === null ? '—'
      : d.regressed ? '**REGRESSED**'
      : (d.improvement ?? 0) > result.tolerance ? 'improved'
      : 'within tolerance'
    const arrow = d.delta === null ? 'n/a' : `${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(4)}`
    lines.push(`| ${d.metric} | ${pct(d.baseline)} | ${pct(d.current)} | ${arrow} | ${verdict} |`)
  }
  lines.push('')
  return lines.join('\n')
}
