import { inject } from '@adonisjs/core'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { GenerationRunResult } from './eval_generation_service.js'
import type { RetrievalRunResult } from './eval_retrieval_service.js'
import { flattenByK, type EvalReport, type ReportMeta } from '../utils/eval/report.js'

const run = promisify(execFile)

export const EVAL_REPORTS_DIR = 'tests/eval/reports'
export const EVAL_BASELINES_DIR = 'tests/eval/baselines'

/**
 * Turns run results into durable, comparable report files.
 *
 * Two formats, on purpose: JSON is what `eval:compare` diffs, and Markdown is
 * what a human actually reads when a number moved and they need to know which
 * question broke and what the model said.
 */
@inject()
export class EvalReportService {
  async buildMeta(
    kind: 'retrieval' | 'generation',
    corpusFingerprint: string,
    params: Record<string, unknown>
  ): Promise<ReportMeta> {
    const [git, nomadVersion, platform] = await Promise.all([
      readGitState(),
      readNomadVersion(),
      readPlatform(),
    ])
    return {
      kind,
      createdAt: new Date().toISOString(),
      corpusFingerprint,
      gitSha: git.sha,
      gitBranch: git.branch,
      gitDirty: git.dirty,
      nomadVersion,
      platform,
      params,
    }
  }

  fromRetrieval(meta: ReportMeta, result: RetrievalRunResult): EvalReport {
    const flatten = (agg: RetrievalRunResult['overall']) => ({
      ...flattenByK('recall', agg.recall),
      ...flattenByK('hitRate', agg.hitRate),
      ...flattenByK('precision', agg.precision),
      ...flattenByK('ndcg', agg.ndcg),
      mrr: agg.mrr,
      emptyRateOnAnswerable: agg.emptyRateOnAnswerable,
      nonEmptyRateOnRefusal: agg.nonEmptyRateOnRefusal,
    })
    return {
      meta,
      metrics: flatten(result.overall),
      byTag: Object.fromEntries(Object.entries(result.byTag).map(([tag, agg]) => [tag, flatten(agg)])),
      cases: result.cases,
    }
  }

  fromGeneration(meta: ReportMeta, result: GenerationRunResult): EvalReport {
    const flatten = (agg: GenerationRunResult['overall']) => ({
      correctness: agg.correctness,
      refusalCorrectness: agg.refusalCorrectness,
      leakageRate: agg.leakageRate,
      thinkTagLeakRate: agg.thinkTagLeakRate,
      markdownRate: agg.markdownRate,
      groundedness: agg.groundedness?.mean ?? null,
    })
    return {
      meta,
      metrics: flatten(result.overall),
      byTag: Object.fromEntries(Object.entries(result.byTag).map(([tag, agg]) => [tag, flatten(agg)])),
      // Answers are kept in full. When a score moves, the only question anyone
      // actually asks is "what did it say?", and a truncated answer cannot
      // answer it.
      cases: result.cases,
    }
  }

  /** Write `<slug>.json` and `<slug>.md`; returns the JSON path. */
  async write(report: EvalReport, slug: string, markdown: string): Promise<string> {
    const dir = resolve(join(process.cwd(), EVAL_REPORTS_DIR))
    await mkdir(dir, { recursive: true })
    const jsonPath = join(dir, `${slug}.json`)
    await writeFile(jsonPath, JSON.stringify(report, null, 2))
    await writeFile(join(dir, `${slug}.md`), markdown)
    return jsonPath
  }

  async read(path: string): Promise<EvalReport> {
    const parsed = JSON.parse(await readFile(resolve(path), 'utf8'))
    if (!parsed?.meta?.kind || !parsed?.metrics) {
      throw new Error(`${path} is not an eval report`)
    }
    return parsed as EvalReport
  }

  /**
   * Baselines are filed under their corpus fingerprint. That is not cosmetic:
   * it makes it structurally impossible to overwrite the baseline for one
   * corpus with a run against another.
   */
  baselinePath(report: EvalReport, name: string): string {
    return resolve(
      join(process.cwd(), EVAL_BASELINES_DIR, report.meta.corpusFingerprint, `${name}.json`)
    )
  }

  async promoteToBaseline(report: EvalReport, name: string): Promise<string> {
    const path = this.baselinePath(report, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(report, null, 2))
    return path
  }
}

async function readGitState() {
  const git = async (args: string[]) => (await run('git', args)).stdout.trim()
  try {
    const [sha, branch, status] = await Promise.all([
      git(['rev-parse', 'HEAD']),
      git(['rev-parse', '--abbrev-ref', 'HEAD']),
      git(['status', '--porcelain']),
    ])
    // A dirty tree matters: it means the report does not correspond to any
    // commit, so a later "this regressed at sha X" claim would be unfounded.
    return { sha, branch, dirty: status.length > 0 }
  } catch {
    return { sha: null, branch: null, dirty: false }
  }
}

async function readNomadVersion(): Promise<string | null> {
  try {
    const pkg = JSON.parse(await readFile(resolve(join(process.cwd(), '..', 'package.json')), 'utf8'))
    return pkg.version ?? null
  } catch {
    return null
  }
}

async function readPlatform() {
  const os = await import('node:os')
  return {
    cpuArchitecture: os.arch(),
    osName: `${os.type()} ${os.release()}`,
    nodeVersion: process.version,
  }
}
