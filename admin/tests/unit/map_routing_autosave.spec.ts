import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { createLatestSelectionSaver } from '../../inertia/lib/latest_selection_saver.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('rapid region changes serialize writes and persist only the latest pending selection', async () => {
  const first = deferred<string>(),
    last = deferred<string>()
  const lastStarted = deferred<void>()
  const writes: string[] = [],
    committed: { value: string; latest: boolean }[] = []
  let concurrent = 0,
    maximum = 0
  const saver = createLatestSelectionSaver({
    save: async (value: string) => {
      writes.push(value)
      if (value === 'c') lastStarted.resolve()
      maximum = Math.max(maximum, ++concurrent)
      const result = await (value === 'a' ? first : last).promise
      concurrent--
      return result
    },
    committed: (value, latest) => {
      committed.push({ value, latest })
    },
    failed: () => assert.fail('Save should succeed'),
  })
  saver.select('a')
  saver.select('b')
  saver.select('c')
  assert.deepEqual(writes, ['a'])
  first.resolve('a')
  await lastStarted.promise
  assert.deepEqual(writes, ['a', 'c'])
  last.resolve('c')
  await saver.whenIdle()
  assert.equal(maximum, 1)
  assert.deepEqual(committed, [
    { value: 'a', latest: false },
    { value: 'c', latest: true },
  ])
})

test('an earlier failed request does not obscure or discard a newer selection', async () => {
  const first = deferred<string>(),
    failures: unknown[] = [],
    saved: string[] = []
  const saver = createLatestSelectionSaver({
    save: (value: string) => (value === 'old' ? first.promise : Promise.resolve(value)),
    committed: (value, latest) => {
      if (latest) saved.push(value)
    },
    failed: (error) => failures.push(error),
  })
  saver.select('old')
  saver.select('latest')
  first.reject(new Error('old failure'))
  await saver.whenIdle()
  assert.deepEqual(failures, [])
  assert.deepEqual(saved, ['latest'])
})

test('latest failure is reported and retrying the same option can save it', async () => {
  let attempts = 0
  const failures: unknown[] = [],
    saved: string[] = []
  const saver = createLatestSelectionSaver({
    save: async (value: string) => {
      if (++attempts === 1) throw new Error('temporarily unavailable')
      return value
    },
    committed: (value, latest) => {
      if (latest) saved.push(value)
    },
    failed: (error) => failures.push(error),
  })
  saver.select('regions:brazil')
  await saver.whenIdle()
  assert.equal(failures.length, 1)
  assert.deepEqual(saved, [])
  saver.select('regions:brazil')
  await saver.whenIdle()
  assert.deepEqual(saved, ['regions:brazil'])
})

test('a selection after navigation replaces an older pending choice and owns its callbacks', async () => {
  const first = deferred<string>()
  const writes: string[] = [],
    oldView: string[] = [],
    newView: string[] = []
  const saver = createLatestSelectionSaver({
    save: (value: string) => {
      writes.push(value)
      return value === 'first' ? first.promise : Promise.resolve(value)
    },
    committed: () => {},
    failed: () => assert.fail('Save should succeed'),
  })
  saver.select('first', { committed: (value) => oldView.push(value) })
  saver.select('older pending', { committed: (value) => oldView.push(value) })
  // A remounted settings view uses the same session queue, with new callbacks.
  saver.select('latest after navigation', { committed: (value) => newView.push(value) })
  first.resolve('first')
  await saver.whenIdle()
  assert.deepEqual(writes, ['first', 'latest after navigation'])
  assert.deepEqual(oldView, [])
  assert.deepEqual(newView, ['latest after navigation'])
})

test('a newer choice during an asynchronous cache commit keeps ownership of the selection', async () => {
  const commitStarted = deferred<void>(),
    releaseCommit = deferred<void>()
  const selections: string[] = []
  const saver = createLatestSelectionSaver({
    save: async (value: string) => value,
    committed: async (value) => {
      if (value === 'old') {
        commitStarted.resolve()
        await releaseCommit.promise
      }
    },
    failed: () => assert.fail('Save should succeed'),
  })
  saver.select('old', { committed: (value) => selections.push(value) })
  await commitStarted.promise
  saver.select('latest', { committed: (value) => selections.push(value) })
  releaseCommit.resolve()
  await saver.whenIdle()
  assert.deepEqual(selections, ['latest'])
})

test('a stale settings GET cannot overwrite the confirmed autosaved preference', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = ['map-routing-settings']
  client.setQueryData(key, 'initial')
  const oldGet = deferred<string>()
  const oldFetch = client
    .fetchQuery({ queryKey: key, queryFn: () => oldGet.promise })
    .catch(() => undefined)
  const saver = createLatestSelectionSaver({
    save: async (value: string) => value,
    committed: async (value) => {
      await client.cancelQueries({ queryKey: key, exact: true }, { revert: false, silent: true })
      client.setQueryData(key, value)
    },
    failed: () => assert.fail('Save should succeed'),
  })
  saver.select('latest')
  await saver.whenIdle()
  oldGet.resolve('stale')
  await oldFetch
  await Promise.resolve()
  assert.equal(client.getQueryData(key), 'latest')
  assert.equal(client.getQueryState(key)?.status, 'success')
  client.clear()
})
