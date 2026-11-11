import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  assertMapRegionSourceUrl,
  assertMapRegionRequestUrl,
  parseMapRegionSource,
} from '../../app/utils/map_region_catalog.js'
import { MapRegionUpdateService } from '../../app/services/map_region_update_service.js'
import { MapRegionService } from '../../app/services/map_region_service.js'
import { MapRegionEstimateService } from '../../app/services/map_region_estimate_service.js'
import type { MapRegionInstalledComponent } from '../../types/map_regions.js'

const canonical = 'https://download.geofabrik.de/europe/andorra-latest.osm.pbf'
const mirror =
  'https://ftp5.gwdg.de/pub/misc/openstreetmap/download.geofabrik.de/europe/andorra-261107.osm.pbf'
const source = { url: canonical, format: 'osm-pbf' as const, sourceId: 'geofabrik' as const }
const date = 'Sun, 08 Nov 2026 00:25:00 GMT'

test('catalog remains canonical while supported data and checksum redirect destinations are explicit', () => {
  assert.doesNotThrow(() => assertMapRegionSourceUrl(canonical, 'geofabrik'))
  assert.throws(() => assertMapRegionSourceUrl(mirror, 'geofabrik'))
  assert.throws(() => parseMapRegionSource({ ...source, url: mirror }))
  for (const url of [canonical, mirror]) {
    assert.doesNotThrow(() => assertMapRegionRequestUrl(url, 'geofabrik'))
    assert.doesNotThrow(() => assertMapRegionRequestUrl(url + '.md5', 'geofabrik', 'checksum'))
    assert.throws(() => assertMapRegionRequestUrl(url + '.md5', 'geofabrik'))
  }
  assert.throws(() => assertMapRegionRequestUrl(mirror, 'ibge-cnefe'))
})

test('mirror support does not allow similar hosts, private URLs, alternate paths or ambiguous encoding', () => {
  const invalid = [
    mirror.replace('ftp5.gwdg.de', 'ftp5.gwdg.de.evil.org'),
    mirror.replace('ftp5.gwdg.de', 'ftp4.gwdg.de'),
    mirror.replace('ftp5.gwdg.de', '127.0.0.1'),
    mirror.replace('https:', 'http:'),
    mirror.replace('https://', 'https://user:secret@'),
    mirror.replace('ftp5.gwdg.de/', 'ftp5.gwdg.de:8443/'),
    mirror.replace('/pub/misc/openstreetmap/download.geofabrik.de/', '/pub/other/'),
    mirror.replace('/andorra-', '/../andorra-'),
    mirror.replace('/andorra-', '/%2e%2e/andorra-'),
    mirror.replace('/andorra-', '/%252e%252e/andorra-'),
    mirror + '?redirect=http://localhost',
    mirror + '#fragment',
    mirror + ' ',
    mirror.replace('/andorra-', '\\andorra-'),
  ]
  for (const url of invalid) {
    assert.throws(() => assertMapRegionRequestUrl(url, 'geofabrik'), url)
    assert.throws(() => assertMapRegionRequestUrl(url + '.md5', 'geofabrik', 'checksum'), url)
  }
})

async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-mirror-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const catalog = join(root, 'vendored.json')
  await writeFile(
    catalog,
    JSON.stringify({
      schema_version: 2,
      regions: [
        {
          id: 'andorra',
          name: 'Andorra',
          coverage: { bbox: [1, 42, 2, 43] },
          sources: { routing: source },
        },
      ],
    })
  )
  return { root, service: new MapRegionService(root, catalog) }
}

test('download HEAD and size estimate follow the supported mirror without fetching the dataset', async (t) => {
  const { service } = await fixture(t)
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: unknown, options: any) => {
    assert.equal(options.method, 'HEAD')
    calls.push(String(url))
    if (url === canonical) return new Response(null, { status: 307, headers: { location: mirror } })
    assert.equal(url, mirror)
    return new Response(null, {
      headers: { 'content-length': '3508150', 'last-modified': date },
    })
  })
  const head = await (service as any).sourceRequest(source, 'HEAD')
  assert.equal(head.url, mirror)
  const preview = await new MapRegionEstimateService(service).estimate('andorra', ['routing'])
  assert.equal(preview.totalSourceBytes, 3508150)
  assert.equal(preview.sources.length, 1)
  assert.deepEqual(calls, [canonical, mirror, canonical, mirror])
})

test('download range request can start at the already validated final mirror URL', async (t) => {
  const { service } = await fixture(t)
  t.mock.method(globalThis, 'fetch', async (url: unknown, options: any) => {
    assert.equal(url, mirror)
    assert.equal(options.method, 'GET')
    assert.deepEqual(options.headers, { Range: 'bytes=300-' })
    return new Response('fixture bytes', { status: 206 })
  })
  const result = await (service as any).sourceRequest({ ...source, url: mirror }, 'GET', {
    Range: 'bytes=300-',
  })
  assert.equal(result.url, mirror)
  assert.equal(result.response.status, 206)
  await result.response.body?.cancel()
})

async function installedFixture(t: any) {
  const { root } = await fixture(t)
  const bytes = Buffer.from('the selected mirror snapshot')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const directory = join(root, 'sources', 'andorra', sha256)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'source.osm.pbf'), bytes)
  const item: MapRegionInstalledComponent = {
    schema_version: 2,
    regionId: 'andorra',
    name: 'Andorra',
    component: 'routing',
    version: 'test',
    coverage: { bbox: [1, 42, 2, 43] },
    artifactPath: 'unused',
    relativePath: 'unused',
    sizeBytes: 1,
    sha256: 'a'.repeat(64),
    source: { ...source, sha256, sizeBytes: bytes.length, downloadedAt: date, lastModified: date },
    createdAt: date,
  }
  return { root, item, bytes, md5: createHash('md5').update(bytes).digest('hex') }
}

test('update check pairs the resolved mirror with its own MD5, not a potentially newer canonical latest', async (t) => {
  const { root, item, bytes, md5 } = await installedFixture(t)
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: unknown, options: any) => {
    calls.push(String(url))
    if (url === canonical) {
      assert.equal(options.method, 'HEAD')
      return new Response(null, { status: 307, headers: { location: mirror } })
    }
    if (url === mirror) {
      assert.equal(options.method, 'HEAD')
      return new Response(null, {
        headers: { 'content-length': String(bytes.length), 'last-modified': date },
      })
    }
    assert.equal(url, mirror + '.md5')
    assert.equal(options.method, 'GET')
    return new Response(md5 + '  andorra-261107.osm.pbf')
  })
  const result = await new MapRegionUpdateService(root).check(item)
  assert.equal(result.status, 'up_to_date')
  assert.equal(result.evidence, 'checksum')
  assert.equal(result.remoteChecksum, md5)
  assert.deepEqual(calls, [canonical, mirror, mirror + '.md5'])
})

test('missing mirror checksum retains comparable metadata without falling back to another source snapshot', async (t) => {
  const { root, item, bytes } = await installedFixture(t)
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    calls.push(String(url))
    if (url === canonical) return new Response(null, { status: 307, headers: { location: mirror } })
    if (url === mirror)
      return new Response(null, {
        headers: { 'content-length': String(bytes.length), 'last-modified': date },
      })
    assert.equal(url, mirror + '.md5')
    return new Response(null, { status: 404 })
  })
  const result = await new MapRegionUpdateService(root).check(item)
  assert.equal(result.status, 'up_to_date')
  assert.equal(result.evidence, 'metadata')
  assert.equal(result.remoteChecksum, undefined)
  assert.deepEqual(calls, [canonical, mirror, mirror + '.md5'])
})

test('unsupported data and checksum redirects are rejected before the target receives a request', async (t) => {
  const { root, item, bytes } = await installedFixture(t)
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    calls.push(String(url))
    if (url === canonical)
      return new Response(null, {
        headers: { 'content-length': String(bytes.length), 'last-modified': date },
      })
    assert.equal(url, canonical + '.md5')
    return new Response(null, {
      status: 302,
      headers: { location: 'https://127.0.0.1/private.osm.pbf.md5' },
    })
  })
  const result = await new MapRegionUpdateService(root).check(item)
  assert.equal(result.evidence, 'metadata')
  assert.deepEqual(calls, [canonical, canonical + '.md5'])
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    assert.equal(url, canonical)
    return new Response(null, {
      status: 302,
      headers: { location: 'https://127.0.0.1/private.osm.pbf' },
    })
  })
  const blocked = await new MapRegionUpdateService(root).check(item)
  assert.equal(blocked.status, 'unavailable')
})
