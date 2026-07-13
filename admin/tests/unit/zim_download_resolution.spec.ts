import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveZimDownload } from '../../app/utils/zim_download_resolution.js'

const manifestResource = {
  id: 'wikipedia_en_all_mini',
  version: '2025-12',
  title: 'Wikipedia',
  description: 'Compact Wikipedia',
  url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2025-12.zim',
  size_mb: 11_400,
}

test('live catalog result replaces stale manifest download metadata', () => {
  const resolved = resolveZimDownload(manifestResource, {
    version: '2026-06',
    download_url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-06.zim',
    size_bytes: 12_531_944_448,
  })

  assert.deepEqual(resolved, {
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-06.zim',
    version: '2026-06',
    sizeBytes: 12_531_944_448,
  })
})

test('missing catalog result falls back to static manifest metadata', () => {
  assert.deepEqual(resolveZimDownload(manifestResource, null), {
    url: manifestResource.url,
    version: manifestResource.version,
    sizeBytes: manifestResource.size_mb * 1024 * 1024,
  })
})

test('catalog result with unknown size keeps the manifest size estimate', () => {
  const resolved = resolveZimDownload(manifestResource, {
    version: '2026-06',
    download_url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-06.zim',
    size_bytes: 0,
  })

  assert.equal(resolved.sizeBytes, manifestResource.size_mb * 1024 * 1024)
})

test('older catalog result does not replace newer manifest metadata', () => {
  const resolved = resolveZimDownload(manifestResource, {
    version: '2025-09',
    download_url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2025-09.zim',
    size_bytes: 10_000,
  })

  assert.equal(resolved.url, manifestResource.url)
  assert.equal(resolved.version, manifestResource.version)
})
