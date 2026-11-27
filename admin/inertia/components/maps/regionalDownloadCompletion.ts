type Cell = { x: number; y: number }
type Task = { id: string; status: string }
type Snapshot = {
  cells: (Cell & { status: string })[]
  job?: (Task & { cells: Cell[] }) | null
  queue?: (Task & { batches: { cells: Cell[] }[] }) | null
  serviceUnavailable?: boolean
}

export type RegionalCompletionState = {
  taskId: string
  cellIds: string[]
  notified: boolean
} | null

type Transition = {
  state: RegionalCompletionState
  clearConfirmation: boolean
  completedSquares: number | null
  pendingVerification: boolean
}

const cellId = ({ x, y }: Cell) => `${x}/${y}`
const isReady = (status: string) => status === 'ready' || status === 'completed'
const isStopped = (status: string) => status === 'failed' || status === 'cancelled'
const isActive = (task: Task | null | undefined) => !!task && !isReady(task.status) && !isStopped(task.status)

/** A confirmation belongs to a task observed running in this mounted view.
 * Transfer percentages and queue counters alone never prove installed coverage.
 */
export function observeRegionalCompletion(
  previous: RegionalCompletionState, snapshot?: Snapshot, available = true,
): Transition {
  const unchanged = { state: previous, clearConfirmation: false, completedSquares: null, pendingVerification: false }
  if (!snapshot || !available || snapshot.serviceUnavailable) return unchanged
  const task = snapshot.queue ?? snapshot.job
  if (!task) return { ...unchanged, state: null, clearConfirmation: !!previous }
  const sameTask = previous?.taskId === task.id
  if (isActive(snapshot.queue) || isActive(snapshot.job)) {
    // A delayed active response must not re-arm an already confirmed task.
    if (sameTask && previous.notified) return unchanged
    const cells = snapshot.queue?.batches.flatMap((batch) => batch.cells) ?? snapshot.job?.cells ?? []
    const cellIds = [...new Set([...(sameTask ? previous.cellIds : []), ...cells.map(cellId)])].sort()
    return { state: { taskId: task.id, cellIds, notified: false },
      clearConfirmation: true, completedSquares: null, pendingVerification: false }
  }
  if (!sameTask) return { ...unchanged, state: null, clearConfirmation: !!previous }
  if (isStopped(task.status)) return { ...unchanged, clearConfirmation: true }
  if (!isReady(task.status) || previous.notified || !previous.cellIds.length) return unchanged
  const installed = new Set(snapshot.cells.filter((cell) => cell.status === 'ready').map(cellId))
  if (!previous.cellIds.every((id) => installed.has(id))) return { ...unchanged, pendingVerification: true }
  return { state: { ...previous, notified: true }, clearConfirmation: false,
    completedSquares: previous.cellIds.length, pendingVerification: false }
}
