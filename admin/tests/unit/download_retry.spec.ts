import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { refreshRetryParams } from '../../app/utils/download_retry.js'
import type { RunDownloadJobParams } from '../../types/downloads.js'
import type { ZimCategoriesSpec } from '../../types/collections.js'

const failed: RunDownloadJobParams = {
  url: 'https://download.kiwix.org/zim/other/prepper_en_2025-01.zim',
  filepath: '/app/storage/zim/prepper_en_2025-01.zim',
  timeout: 30000,
  allowedMimeTypes: ['application/x-zim'],
  filetype: 'zim',
  title: 'Prepper',
  totalBytes: 100 * 1024 * 1024,
  resourceMetadata: {
    resource_id: 'prepper_en',
    version: '2025-01',
    collection_ref: 'survival',
  },
}

function specWith(resource: { id: string; version: string; url: string; size_mb: number }) {
  return {
    spec_version: '1',
    categories: [
      {
        name: 'Survival',
        slug: 'survival',
        icon: 'tent',
        description: '',
        language: 'en',
        tiers: [
          {
            name: 'Essential',
            slug: 'essential',
            description: '',
            resources: [{ title: 'Prepper', description: '', ...resource }],
          },
        ],
      },
    ],
  } satisfies ZimCategoriesSpec
}

test('retry of a curated download uses the url, version and filename the catalog has now', () => {
  const retried = refreshRetryParams(
    failed,
    specWith({
      id: 'prepper_en',
      version: '2026-09',
      url: 'https://download.kiwix.org/zim/other/prepper_en_2026-09.zim',
      size_mb: 120,
    })
  )

  assert.equal(retried.url, 'https://download.kiwix.org/zim/other/prepper_en_2026-09.zim')
  assert.equal(retried.filepath, '/app/storage/zim/prepper_en_2026-09.zim')
  assert.equal(retried.totalBytes, 120 * 1024 * 1024)
  assert.deepEqual(retried.resourceMetadata, {
    resource_id: 'prepper_en',
    version: '2026-09',
    collection_ref: 'survival',
  })
  assert.equal(retried.title, 'Prepper')
})

test('retry keeps the stored params when the catalog no longer has the resource', () => {
  const retried = refreshRetryParams(
    failed,
    specWith({
      id: 'prepper_en_renamed',
      version: '2026-09',
      url: 'https://download.kiwix.org/zim/other/prepper_en_renamed_2026-09.zim',
      size_mb: 120,
    })
  )

  assert.deepEqual(retried, failed)
})

test('retry keeps the stored params when no catalog is available', () => {
  assert.deepEqual(refreshRetryParams(failed, null), failed)
})

test('retry of a download that came from no collection keeps the stored params', () => {
  const manual: RunDownloadJobParams = {
    ...failed,
    resourceMetadata: { resource_id: 'prepper_en', version: '2025-01', collection_ref: null },
  }
  const spec = specWith({
    id: 'prepper_en',
    version: '2026-09',
    url: 'https://download.kiwix.org/zim/other/prepper_en_2026-09.zim',
    size_mb: 120,
  })

  assert.deepEqual(refreshRetryParams(manual, spec), manual)
  assert.deepEqual(refreshRetryParams({ ...failed, resourceMetadata: undefined }, spec), {
    ...failed,
    resourceMetadata: undefined,
  })
})

test('retry of a map download keeps the stored params', () => {
  const map: RunDownloadJobParams = { ...failed, filetype: 'map' }
  const spec = specWith({
    id: 'prepper_en',
    version: '2026-09',
    url: 'https://download.kiwix.org/zim/other/prepper_en_2026-09.zim',
    size_mb: 120,
  })

  assert.deepEqual(refreshRetryParams(map, spec), map)
})
