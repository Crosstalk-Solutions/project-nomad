/**
 * Pure helpers for cancelling a running benchmark. No framework imports, so the
 * decision logic can be unit-tested directly. The Redis signal lives in
 * benchmark_cancel_signal.ts.
 */

/** What to do with the AI benchmark model when a run is cancelled. */
export type BenchmarkCancelChoice = 'keep' | 'delete'

export function parseCancelChoice(value: unknown): BenchmarkCancelChoice | null {
  return value === 'keep' || value === 'delete' ? value : null
}

/** Thrown out of a run that the user cancelled. Never saved as a result. */
export class BenchmarkCancelledError extends Error {
  constructor(public readonly choice: BenchmarkCancelChoice = 'keep') {
    super('Benchmark cancelled')
    this.name = 'BenchmarkCancelledError'
  }
}

/** What the AI stage had done with the benchmark model when the cancel arrived. */
export interface BenchmarkModelState {
  /** The model was already installed before this run started. */
  hadModelBefore: boolean
  /** This run started pulling the model. */
  pullStarted: boolean
  /** That pull finished, so the model is now fully installed. */
  pullCompleted: boolean
}

export type ModelCleanupAction = 'none' | 'delete-model' | 'partial-left'

/**
 * Decide what cleanup a cancel needs.
 * - A model the user already had is never touched.
 * - A model this run fully downloaded is deleted only if the user asked.
 * - A partial download can't be deleted through Ollama's API (it isn't a model
 *   yet). It is kept so the next run resumes it; Ollama prunes it on restart.
 */
export function decideModelCleanup(
  choice: BenchmarkCancelChoice,
  state: BenchmarkModelState | null
): ModelCleanupAction {
  if (!state || state.hadModelBefore || !state.pullStarted) return 'none'
  if (!state.pullCompleted) return 'partial-left'
  return choice === 'delete' ? 'delete-model' : 'none'
}

/** One sentence for the "Benchmark cancelled" message, or '' when nothing was downloaded. */
export function describeModelCleanup(
  action: ModelCleanupAction,
  choice: BenchmarkCancelChoice,
  model: string,
  state: BenchmarkModelState | null,
  deleteSucceeded = true
): string {
  if (action === 'delete-model') {
    return deleteSucceeded
      ? `Deleted the AI benchmark model (${model}).`
      : `Could not delete the AI benchmark model (${model}). You can remove it from the AI Assistant settings.`
  }
  if (action === 'partial-left') {
    return choice === 'delete'
      ? `The partly downloaded AI benchmark model (${model}) can't be deleted until it finishes; Ollama removes it the next time the AI service restarts.`
      : `The partly downloaded AI benchmark model (${model}) was kept, so the next AI benchmark picks up where it stopped.`
  }
  if (state && !state.hadModelBefore && state.pullCompleted) {
    return `The AI benchmark model (${model}) stays installed, so the next AI benchmark starts straight away.`
  }
  return ''
}
