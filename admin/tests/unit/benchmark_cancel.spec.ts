import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BenchmarkCancelledError,
  decideModelCleanup,
  describeModelCleanup,
  parseCancelChoice,
  type BenchmarkModelState,
} from '../../app/utils/benchmark_cancel.js'

const MODEL = 'llama3.1:8b'
const hadIt: BenchmarkModelState = {
  hadModelBefore: true,
  pullStarted: false,
  pullCompleted: false,
}
const midPull: BenchmarkModelState = {
  hadModelBefore: false,
  pullStarted: true,
  pullCompleted: false,
}
const pulled: BenchmarkModelState = {
  hadModelBefore: false,
  pullStarted: true,
  pullCompleted: true,
}

test('parseCancelChoice accepts keep/delete only', () => {
  assert.equal(parseCancelChoice('keep'), 'keep')
  assert.equal(parseCancelChoice('delete'), 'delete')
  assert.equal(parseCancelChoice('1'), null)
  assert.equal(parseCancelChoice(null), null)
})

test('BenchmarkCancelledError carries the choice and defaults to keep', () => {
  assert.equal(new BenchmarkCancelledError('delete').choice, 'delete')
  assert.equal(new BenchmarkCancelledError().choice, 'keep')
  assert.equal(new BenchmarkCancelledError().name, 'BenchmarkCancelledError')
})

test('decideModelCleanup: cancelled before the AI stage touches nothing', () => {
  assert.equal(decideModelCleanup('keep', null), 'none')
  assert.equal(decideModelCleanup('delete', null), 'none')
})

test('decideModelCleanup: a model the user already had is never deleted', () => {
  assert.equal(decideModelCleanup('keep', hadIt), 'none')
  assert.equal(decideModelCleanup('delete', hadIt), 'none')
  // Even if a pull was (wrongly) marked complete, hadModelBefore wins.
  assert.equal(
    decideModelCleanup('delete', { ...hadIt, pullStarted: true, pullCompleted: true }),
    'none'
  )
})

test('decideModelCleanup: a partial download is left for resume either way', () => {
  assert.equal(decideModelCleanup('keep', midPull), 'partial-left')
  assert.equal(decideModelCleanup('delete', midPull), 'partial-left')
})

test('decideModelCleanup: a model this run downloaded is deleted only on request', () => {
  assert.equal(decideModelCleanup('keep', pulled), 'none')
  assert.equal(decideModelCleanup('delete', pulled), 'delete-model')
})

test('describeModelCleanup explains each outcome', () => {
  assert.equal(describeModelCleanup('none', 'keep', MODEL, null), '')
  assert.equal(describeModelCleanup('none', 'delete', MODEL, hadIt), '')
  assert.match(describeModelCleanup('none', 'keep', MODEL, pulled), /stays installed/)
  assert.match(
    describeModelCleanup('delete-model', 'delete', MODEL, pulled),
    /^Deleted the AI benchmark model/
  )
  assert.match(
    describeModelCleanup('delete-model', 'delete', MODEL, pulled, false),
    /Could not delete/
  )
  assert.match(
    describeModelCleanup('partial-left', 'keep', MODEL, midPull),
    /picks up where it stopped/
  )
  assert.match(
    describeModelCleanup('partial-left', 'delete', MODEL, midPull),
    /next time the AI service restarts/
  )
})
