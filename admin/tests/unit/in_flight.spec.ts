import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { joinInFlight } from '../../app/utils/in_flight.js'

function deferred() {
  let resolve!: () => void
  let reject!: (err: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('a second install of a service that is still installing joins the first (#1439)', async () => {
  const inFlight = new Map<string, Promise<void>>()
  const qdrant = deferred()
  let starts = 0
  const install = () => {
    starts++
    return qdrant.promise
  }

  // Qdrant's own install, then Ollama's dependency check for Qdrant, on the next tick.
  const own = joinInFlight(inFlight, 'nomad_qdrant', install)
  await Promise.resolve()
  const fromDependency = joinInFlight(inFlight, 'nomad_qdrant', install)

  assert.equal(starts, 1)
  assert.equal(fromDependency, own)

  qdrant.resolve()
  await fromDependency
  assert.equal(inFlight.has('nomad_qdrant'), false)
})

test('a joined install that fails rejects every caller once, and can be retried', async () => {
  const inFlight = new Map<string, Promise<void>>()
  const first = deferred()
  let starts = 0

  const a = joinInFlight(inFlight, 'nomad_qdrant', () => {
    starts++
    return first.promise
  })
  const b = joinInFlight(inFlight, 'nomad_qdrant', () => {
    starts++
    return Promise.resolve()
  })
  first.reject(new Error('pull failed'))

  await assert.rejects(a, /pull failed/)
  await assert.rejects(b, /pull failed/)
  assert.equal(starts, 1)
  assert.equal(inFlight.has('nomad_qdrant'), false)

  await joinInFlight(inFlight, 'nomad_qdrant', () => {
    starts++
    return Promise.resolve()
  })
  assert.equal(starts, 2)
})

test('installs of different services run independently', async () => {
  const inFlight = new Map<string, Promise<void>>()
  const qdrant = deferred()
  let ollamaStarted = false

  const q = joinInFlight(inFlight, 'nomad_qdrant', () => qdrant.promise)
  await joinInFlight(inFlight, 'nomad_ollama', async () => {
    ollamaStarted = true
  })

  assert.equal(ollamaStarted, true)
  assert.equal(inFlight.has('nomad_qdrant'), true)
  qdrant.resolve()
  await q
})
