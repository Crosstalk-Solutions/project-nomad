import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeDownloads } from '../../inertia/lib/downloads_summary.js'
import type { DownloadJobWithProgress } from '../../types/downloads.js'

function job(overrides: Partial<DownloadJobWithProgress>): DownloadJobWithProgress {
  return {
    jobId: '1',
    url: 'https://example.com/f',
    progress: 0,
    filepath: '',
    filetype: 'zim',
    ...overrides,
  }
}

test('summarizeDownloads: nothing queued means nothing to show', () => {
  assert.deepEqual(summarizeDownloads(undefined), { inProgress: 0, failed: 0, percent: null })
  assert.deepEqual(summarizeDownloads([]), { inProgress: 0, failed: 0, percent: null })
})

test('summarizeDownloads: weights overall progress by bytes when every size is known', () => {
  const summary = summarizeDownloads([
    job({ jobId: 'a', status: 'active', progress: 100, downloadedBytes: 100, totalBytes: 100 }),
    job({ jobId: 'b', status: 'active', progress: 0, downloadedBytes: 0, totalBytes: 900 }),
  ])
  // 100 of 1000 bytes, not the 50% a plain average would give
  assert.deepEqual(summary, { inProgress: 2, failed: 0, percent: 10 })
})

test('summarizeDownloads: falls back to the average percentage when a size is unknown', () => {
  const summary = summarizeDownloads([
    job({ jobId: 'a', status: 'active', progress: 80, totalBytes: 100, downloadedBytes: 80 }),
    job({ jobId: 'b', status: 'waiting', progress: 20 }),
  ])
  assert.deepEqual(summary, { inProgress: 2, failed: 0, percent: 50 })
})

test('summarizeDownloads: failed jobs are counted separately and excluded from progress', () => {
  const summary = summarizeDownloads([
    job({ jobId: 'a', status: 'active', progress: 40 }),
    job({ jobId: 'b', status: 'failed', progress: 90, failedReason: 'HTTP 404' }),
  ])
  assert.deepEqual(summary, { inProgress: 1, failed: 1, percent: 40 })
})

test('summarizeDownloads: only failures left reports no progress', () => {
  assert.deepEqual(summarizeDownloads([job({ status: 'failed' })]), {
    inProgress: 0,
    failed: 1,
    percent: null,
  })
})

test('summarizeDownloads: clamps bad progress values into 0-100', () => {
  assert.equal(summarizeDownloads([job({ status: 'active', progress: 140 })]).percent, 100)
  assert.equal(summarizeDownloads([job({ status: 'active', progress: Number.NaN })]).percent, 0)
  assert.equal(
    summarizeDownloads([job({ status: 'active', downloadedBytes: 150, totalBytes: 100 })]).percent,
    100
  )
})
