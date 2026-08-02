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

test('non-padded catalog months are compared numerically', () => {
  const resource = {
    ...manifestResource,
    version: '2026-2',
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-2.zim',
  }
  const resolved = resolveZimDownload(resource, {
    version: '2026-10',
    download_url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-10.zim',
    size_bytes: 13_000,
  })

  assert.equal(
    resolved.url,
    'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-10.zim'
  )
  assert.equal(resolved.version, '2026-10')
})

// ---- Gated, self-hosted content ----
//
// Resources we host behind the entitlement Worker are pinned to the manifest URL.
// They are not in the openzim catalog, so a catalog match can only ever be a
// resource-id collision, and following it would swap our content for a third
// party's AND drop the Authorization header.

const gatedResource = {
  id: 'field-manuals',
  version: '2026-07',
  title: 'US Military Field Manuals',
  description: 'Public-domain US military field manuals',
  url: 'https://nomad-packs-worker.chris-556.workers.dev/content/field-manuals_2026-07.zim',
  size_mb: 2_000,
  auth: 'nomad_app_key' as const,
}

test('gated resource ignores a newer catalog result and stays on the manifest URL', () => {
  const resolved = resolveZimDownload(gatedResource, {
    version: '2026-12',
    download_url: 'https://download.kiwix.org/zim/other/field-manuals_2026-12.zim',
    size_bytes: 9_999_999,
  })

  assert.deepEqual(resolved, {
    url: gatedResource.url,
    version: gatedResource.version,
    sizeBytes: gatedResource.size_mb * 1024 * 1024,
  })
})

test('gated resource resolves normally with no catalog result', () => {
  assert.deepEqual(resolveZimDownload(gatedResource, null), {
    url: gatedResource.url,
    version: gatedResource.version,
    sizeBytes: gatedResource.size_mb * 1024 * 1024,
  })
})

test('absent auth leaves catalog precedence untouched', () => {
  const resolved = resolveZimDownload(manifestResource, {
    version: '2026-06',
    download_url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-06.zim',
    size_bytes: 12_531_944_448,
  })

  assert.equal(
    resolved.url,
    'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-06.zim'
  )
})
