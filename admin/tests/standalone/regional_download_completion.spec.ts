import assert from 'node:assert/strict'
import test from 'node:test'
import { observeRegionalCompletion } from '../../inertia/components/maps/regionalDownloadCompletion.js'

const a = { x: 41, y: 93 }
const b = { x: 42, y: 93 }
const job = (status: string, id = 'job-a') => ({ id, status, cells: [a, b], progress: 100 })
const readyCells = [a, b].map((cell) => ({ ...cell, status: 'ready' }))
const queue = (status: string) => ({ id: 'queue-a', status, totalCells: 2, completedCells: 2,
  batches: [{ cells: [a] }, { cells: [b] }] })

test('initial or reloaded completed jobs and queues produce no history or confirmation', () => {
  for (const snapshot of [{ job: job('ready'), cells: readyCells },
    { queue: queue('completed'), job: job('ready'), cells: readyCells }]) {
    assert.deepEqual(observeRegionalCompletion(null, snapshot), {
      state: null, clearConfirmation: false, completedSquares: null, pendingVerification: false,
    })
  }
})

test('100% transfer or one completed batch cannot complete a running multi-batch queue', () => {
  const running = observeRegionalCompletion(null, { queue: queue('running'), job: job('ready'), cells: readyCells })
  assert.equal(running.completedSquares, null)
  assert.equal(running.state?.taskId, 'queue-a')
  const verifying = observeRegionalCompletion(running.state, { queue: queue('running'), job: job('verifying'), cells: readyCells })
  assert.equal(verifying.completedSquares, null)
  const complete = observeRegionalCompletion(verifying.state, { queue: queue('ready'), job: job('ready'), cells: readyCells })
  assert.equal(complete.completedSquares, 2)
})

test('late inventory keeps verification pending and announces only once all selected cells are ready', () => {
  const active = observeRegionalCompletion(null, { job: job('downloading'), cells: [] })
  const lagged = observeRegionalCompletion(active.state, { job: job('ready'), cells: [readyCells[0], { ...b, status: 'preparing' }] })
  assert.equal(lagged.completedSquares, null)
  assert.equal(lagged.pendingVerification, true)
  const complete = observeRegionalCompletion(lagged.state, { job: job('ready'), cells: readyCells })
  assert.equal(complete.completedSquares, 2)
  assert.equal(complete.pendingVerification, false)
  for (let index = 0; index < 3; index++) {
    const poll = observeRegionalCompletion(complete.state, { job: job('ready'), cells: readyCells })
    assert.equal(poll.completedSquares, null)
    assert.equal(poll.clearConfirmation, false)
  }
  const lateActive = observeRegionalCompletion(complete.state, { job: job('downloading'), cells: readyCells })
  assert.equal(lateActive.state?.notified, true)
  assert.equal(lateActive.clearConfirmation, false)
  assert.equal(observeRegionalCompletion(lateActive.state, { job: job('ready'), cells: readyCells }).completedSquares, null)
})

test('worker unavailability and request errors preserve the active task observation', () => {
  const active = observeRegionalCompletion(null, { job: job('preparing'), cells: [] })
  const offline = observeRegionalCompletion(active.state, { job: null, cells: readyCells, serviceUnavailable: true })
  assert.deepEqual(offline.state, active.state)
  assert.equal(offline.completedSquares, null)
  const failedRequest = observeRegionalCompletion(offline.state, { job: null, cells: [] }, false)
  assert.deepEqual(failedRequest.state, active.state)
  assert.equal(observeRegionalCompletion(failedRequest.state, { job: job('ready'), cells: readyCells }).completedSquares, 2)
})

test('new tasks, discarded tasks and stopped tasks clear previous confirmation without claiming success', () => {
  const active = observeRegionalCompletion(null, { job: job('downloading'), cells: [] })
  for (const status of ['failed', 'cancelled']) {
    const stopped = observeRegionalCompletion(active.state, { job: job(status), cells: readyCells })
    assert.equal(stopped.completedSquares, null)
    assert.equal(stopped.clearConfirmation, true)
  }
  const newReady = observeRegionalCompletion(active.state, { job: job('ready', 'other-job'), cells: readyCells })
  assert.equal(newReady.completedSquares, null)
  assert.equal(newReady.state, null)
  assert.equal(newReady.clearConfirmation, true)
  const discarded = observeRegionalCompletion(active.state, { job: null, cells: readyCells })
  assert.equal(discarded.state, null)
  assert.equal(discarded.completedSquares, null)
  const newActive = observeRegionalCompletion(active.state, { job: job('queued', 'other-job'), cells: [] })
  assert.equal(newActive.state?.taskId, 'other-job')
  assert.equal(newActive.clearConfirmation, true)
})

test('duplicate coordinates are counted once and empty task selections never announce success', () => {
  const active = observeRegionalCompletion(null, { job: { id: 'dedup', status: 'verifying', cells: [a, a] }, cells: [] })
  assert.equal(observeRegionalCompletion(active.state, { job: { id: 'dedup', status: 'ready', cells: [a] }, cells: readyCells }).completedSquares, 1)
  const empty = observeRegionalCompletion(null, { job: { id: 'empty', status: 'queued', cells: [] }, cells: [] })
  assert.equal(observeRegionalCompletion(empty.state, { job: { id: 'empty', status: 'ready', cells: [] }, cells: [] }).completedSquares, null)
})
