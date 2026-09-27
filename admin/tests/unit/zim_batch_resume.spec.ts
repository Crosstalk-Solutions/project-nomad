import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { hasResumeCursor, openZimBatchRange } from '../../app/utils/zim_batch_resume.js'

type FakeEntry = { path: string; article: boolean }

const directory: FakeEntry[] = [
  { path: 'A.html', article: true },
  { path: 'A_files/img.png', article: false },
  { path: 'B.html', article: true },
  { path: 'C.html', article: true },
  { path: 'C_files/style.css', article: false },
  { path: 'D.html', article: true },
]

function fakeArchive(entries: FakeEntry[]) {
  const range = {
    size: entries.length,
    offset(start: number, maxResults: number) {
      return entries.slice(start, start + maxResults)
    },
    [Symbol.iterator]() {
      return entries[Symbol.iterator]()
    },
  }
  return { iterByPath: () => range }
}

function takeArticleBatch(entries: Iterable<FakeEntry>, batchSize: number) {
  const accepted: string[] = []
  let direntsConsumed = 0
  for (const entry of entries) {
    if (accepted.length >= batchSize) break
    direntsConsumed++
    if (!entry.article) continue
    accepted.push(entry.path)
  }
  return { accepted, direntsConsumed }
}

test('hasResumeCursor rejects an empty or zero cursor', () => {
  assert.equal(hasResumeCursor(undefined), false)
  assert.equal(hasResumeCursor(0), false)
  assert.equal(hasResumeCursor(4), true)
  assert.equal(hasResumeCursor(-1), false)
  assert.equal(hasResumeCursor(1.5), false)
})

test('openZimBatchRange reads from the start when there is no cursor', () => {
  const archive = fakeArchive(directory)
  assert.deepEqual(
    [...openZimBatchRange(archive)].map((entry) => entry.path),
    directory.map((entry) => entry.path)
  )
})

test('openZimBatchRange seeks with offset at the dirent cursor', () => {
  const archive = fakeArchive(directory)
  let walkedFromStart = false
  const wrapped = {
    iterByPath: () => {
      const range = archive.iterByPath()
      return {
        size: range.size,
        offset: (start: number, maxResults: number) => range.offset(start, maxResults),
        [Symbol.iterator]() {
          walkedFromStart = true
          return range[Symbol.iterator]()
        },
      }
    },
  }

  const paths = [...openZimBatchRange(wrapped, 3)].map((entry) => entry.path)
  assert.equal(walkedFromStart, false)
  assert.deepEqual(paths, ['C.html', 'C_files/style.css', 'D.html'])
})

test('a later batch continues at the next dirent instead of rereading earlier ones', () => {
  const archive = fakeArchive(directory)

  const first = takeArticleBatch(openZimBatchRange(archive), 2)
  assert.deepEqual(first.accepted, ['A.html', 'B.html'])
  assert.equal(first.direntsConsumed, 3)

  const second = takeArticleBatch(openZimBatchRange(archive, first.direntsConsumed), 2)
  assert.deepEqual(second.accepted, ['C.html', 'D.html'])
  assert.equal(second.direntsConsumed, 3)
})
