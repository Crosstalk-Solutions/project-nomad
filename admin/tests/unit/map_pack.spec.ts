import * as assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import type { MapPackManifest } from '../../types/map_packs.js'
import {
  assertMapPackDownloadUrl,
  downloadMapPackArtifact,
  verifyMapPackArtifact,
} from '../../app/utils/map_pack_download.js'
import {
  mapPackId,
  parseMapPackCatalog,
  parseMapPackManifest,
} from '../../app/utils/map_pack_manifest.js'
import { MapPackStore } from '../../app/utils/map_pack_store.js'

function manifest(id = 'test-region', data = Buffer.from('offline graph')): MapPackManifest {
  return {
    schema_version: 1,
    id,
    name: 'Test region',
    version: '2026.11',
    coverage: { bbox: [-48, -24, -46, -22], description: 'Test coverage' },
    routing: {
      engine: 'valhalla',
      profiles: ['auto', 'pedestrian'],
      artifact: {
        url: 'https://example.org/routing.tar',
        filename: 'routing.tar',
        size_bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      },
    },
  }
}

async function fixture(t: TestContext, data = Buffer.from('offline graph'), responseData = data) {
  const root = await mkdtemp(join(tmpdir(), 'nomad-map-pack-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
  })
  const ranges: (string | undefined)[] = []
  const server = createServer((request, response) => {
    ranges.push(request.headers.range)
    const offset = Number(/^bytes=(\d+)-$/.exec(request.headers.range ?? '')?.[1] ?? 0)
    if (offset) {
      response.writeHead(206, {
        'Content-Range': `bytes ${offset}-${responseData.length - 1}/${responseData.length}`,
        'Content-Length': responseData.length - offset,
      })
    }
    response.end(responseData.subarray(offset))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const pack = manifest('test-region', data)
  pack.routing.artifact.url = `http://127.0.0.1:${address.port}/routing.tar`
  const catalog = join(root, 'catalog.json')
  await writeFile(catalog, JSON.stringify({ schema_version: 1, packages: [pack] }))
  const store = new MapPackStore(join(root, 'packs'), catalog, true)
  return { root, store, pack, data, ranges, catalog }
}

test('manifest validation rejects IDs, versions and artifact names that could escape storage', () => {
  for (const id of ['..', '../outside', '/absolute', 'a\\b', '%2e%2e', 'UPPER', '']) {
    assert.throws(() => mapPackId(id))
  }
  assert.throws(() => parseMapPackManifest({ ...manifest(), version: '../other' }))
  const unsafe = manifest()
  unsafe.routing.artifact.filename = '../routing.tar' as 'routing.tar'
  assert.throws(() => parseMapPackManifest(unsafe))
  assert.equal(parseMapPackManifest(manifest()).id, 'test-region')
})

test('catalog validates graph coverage, integrity metadata, supported profiles and unique IDs', () => {
  const pack = manifest()
  assert.deepEqual(parseMapPackCatalog({ schema_version: 1, packages: [pack] }).packages, [pack])
  assert.throws(() => parseMapPackCatalog({ schema_version: 1, packages: [pack, pack] }))
  assert.throws(() => parseMapPackManifest({ ...pack, coverage: { bbox: [-48, 90, -46, 95] } }))
  assert.throws(() =>
    parseMapPackManifest({ ...pack, routing: { ...pack.routing, profiles: ['bicycle'] } })
  )
  assert.throws(() =>
    parseMapPackManifest({
      ...pack,
      routing: { ...pack.routing, artifact: { ...pack.routing.artifact, sha256: 'missing' } },
    })
  )
  assert.throws(() => parseMapPackManifest({ ...pack, schema_version: 2 }))
})

test('imported territory metadata must name the country independently of the package ID', () => {
  const pack = manifest('brazil')
  assert.equal(parseMapPackManifest(pack).coverage.territory_scope, undefined)
  assert.throws(() =>
    parseMapPackManifest({ ...pack, coverage: { ...pack.coverage, territory_scope: 'country' } })
  )
  assert.throws(() =>
    parseMapPackManifest({
      ...pack,
      coverage: { ...pack.coverage, territory_scope: 'country', country_codes: ['AR', 'BR'] },
    })
  )
  const classified = parseMapPackManifest({
    ...pack,
    coverage: { ...pack.coverage, territory_scope: 'subregion', country_codes: ['AR'] },
  })
  assert.deepEqual(classified.coverage.country_codes, ['AR'])
})

test('installed import discovery is independent of a broken catalog and another package state', async (t) => {
  const { store, pack, catalog } = await fixture(t)
  await store.install(pack.id)
  await writeFile(catalog, '{damaged')
  await writeFile(join(store.root, 'state', 'broken.json'), '{damaged')
  t.mock.method(console, 'warn', () => {})
  const installed = await store.listInstalled()
  assert.deepEqual(
    installed.map(({ id, status }) => ({ id, status })),
    [{ id: pack.id, status: 'installed' }]
  )
})

test('local mirrors require explicit opt-in and metadata URLs are always rejected', async () => {
  await assert.rejects(() => assertMapPackDownloadUrl('http://127.0.0.1/routing.tar'))
  await assert.rejects(() => assertMapPackDownloadUrl('https://127.0.0.1/routing.tar'))
  await assert.rejects(() => assertMapPackDownloadUrl('http://169.254.169.254/latest', true))
  await assert.rejects(() => assertMapPackDownloadUrl('http://[fd00:ec2::254]/latest', true))
  await assert.rejects(() => assertMapPackDownloadUrl('file:///etc/passwd', true))
  await assertMapPackDownloadUrl('http://127.0.0.1/routing.tar', true)
})

test('install resumes a staged artifact and publishes only after size and SHA-256 verification', async (t) => {
  const { store, pack, data, ranges } = await fixture(t)
  const staging = join(store.root, 'staging', pack.id, pack.version)
  await mkdir(staging, { recursive: true })
  await writeFile(join(staging, 'routing.tar.part'), data.subarray(0, 4))
  let state = await store.list()
  assert.equal(state.packages[0].status, 'available')
  await store.install(pack.id, pack.version)
  assert.equal(ranges[0], 'bytes=4-')
  const graph = join(store.root, 'installed', pack.id, pack.version, 'routing.tar')
  assert.deepEqual(await readFile(graph), data)
  await verifyMapPackArtifact(graph, pack.routing.artifact)
  state = await store.list()
  assert.equal(state.packages[0].status, 'installed')
  const installed = await store.getInstalledPackage(pack.id)
  assert.equal(installed?.version, pack.version)
  await assert.rejects(() => stat(join(staging, 'routing.tar.part')))
})

test('same-size corruption fails closed, records the error and discards the corrupt partial', async (t) => {
  const data = Buffer.from('correct graph')
  const { store, pack } = await fixture(t, data, Buffer.from('corrupt graph'))
  await assert.rejects(() => store.install(pack.id), /SHA-256 mismatch/)
  assert.equal(await store.getInstalledPackage(pack.id), null)
  const state = await store.list()
  assert.equal(state.packages[0].status, 'failed')
  assert.match(state.packages[0].error ?? '', /SHA-256/)
  await assert.rejects(() =>
    stat(join(store.root, 'staging', pack.id, pack.version, 'routing.tar.part'))
  )
})

test('downloads cannot fill disk beyond the manifest size', async (t) => {
  const { store, pack } = await fixture(
    t,
    Buffer.from('short'),
    Buffer.from('much larger than declared')
  )
  await assert.rejects(() => store.install(pack.id), /exceeded the declared artifact size/)
  assert.equal(await store.getInstalledPackage(pack.id), null)
})

test('a mirror ignoring Range replaces the partial instead of appending', async (t) => {
  const { root, pack, data } = await fixture(t)
  const server = createServer((_request, response) => response.end(data))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const partial = join(root, 'resumed.part')
  await writeFile(partial, data.subarray(0, 3))
  await downloadMapPackArtifact(
    { ...pack.routing.artifact, url: `http://127.0.0.1:${address.port}/graph` },
    partial,
    { allowLocal: true }
  )
  assert.deepEqual(await readFile(partial), data)
})

test('catalog version drift fails before downloading an unexpected graph', async (t) => {
  const { store, pack, ranges } = await fixture(t)
  await assert.rejects(() => store.install(pack.id, 'older-version'), /Catalog changed/)
  assert.equal(ranges.length, 0)
})

test(
  'activation preserves the old graph on failure, switches atomically, and deactivation permits removal',
  {
    skip:
      process.platform === 'win32'
        ? 'Production uses Linux symlink replacement; tested in Linux runtime'
        : false,
  },
  async (t) => {
    const { store, pack, catalog, data } = await fixture(t)
    const second = { ...pack, id: 'second-region' }
    await writeFile(catalog, JSON.stringify({ schema_version: 1, packages: [pack, second] }))
    await store.install(pack.id)
    await store.install(second.id)
    await store.activate(pack.id)
    let active = await store.getActivePackage()
    assert.equal(active?.id, pack.id)
    await assert.rejects(() => store.uninstall(pack.id), /active package/)
    const secondGraph = join(store.root, 'installed', second.id, second.version, 'routing.tar')
    await writeFile(secondGraph, 'incomplete')
    await assert.rejects(() => store.activate(second.id), /not installed|incomplete/)
    active = await store.getActivePackage()
    assert.equal(active?.id, pack.id)
    assert.deepEqual(await readFile(store.getActiveRoutingPath()), data)
    await writeFile(secondGraph, data)
    await store.activate(second.id)
    active = await store.getActivePackage()
    assert.equal(active?.id, second.id)
    await store.uninstall(pack.id)
    await store.deactivate()
    assert.equal(await store.getActivePackage(), null)
    await store.uninstall(second.id)
    const state = await store.list()
    assert.equal(
      state.packages.every((p) => p.status === 'available'),
      true
    )
  }
)

test('uninstall refuses path traversal and leaves neighboring files intact', async (t) => {
  const { store, root } = await fixture(t)
  const neighbor = join(root, 'keep.txt')
  await writeFile(neighbor, 'keep')
  await assert.rejects(() => store.uninstall('../keep.txt'))
  assert.equal(await readFile(neighbor, 'utf8'), 'keep')
})

test(
  'concurrent activation and removal cannot leave a dangling active graph',
  {
    skip:
      process.platform === 'win32'
        ? 'Production uses Linux symlink replacement; tested in Linux runtime'
        : false,
  },
  async (t) => {
    const { store, pack, catalog } = await fixture(t)
    const second = { ...pack, id: 'second-region' }
    await writeFile(catalog, JSON.stringify({ schema_version: 1, packages: [pack, second] }))
    await store.install(pack.id)
    await store.install(second.id)
    await store.activate(pack.id)
    const outcomes = await Promise.allSettled([
      store.activate(second.id),
      store.uninstall(second.id),
    ])
    assert.equal(outcomes[0].status, 'fulfilled')
    assert.equal(outcomes[1].status, 'rejected')
    const active = await store.getActivePackage()
    assert.equal(active?.id, second.id)
    await stat(store.getActiveRoutingPath())
  }
)

test('a catalog upgrade cannot overwrite the state of an installed version', async (t) => {
  const { store, pack, catalog, data, ranges } = await fixture(t)
  await store.install(pack.id)
  const newer = { ...pack, version: '2026.12' }
  await writeFile(catalog, JSON.stringify({ schema_version: 1, packages: [newer] }))
  const downloads = ranges.length
  await assert.rejects(() => store.markQueued(newer), { status: 409 })
  await assert.rejects(() => store.install(pack.id, newer.version), { status: 409 })
  assert.equal(ranges.length, downloads)
  const state = await store.list()
  const current = state.packages[0]
  assert.equal(current.status, 'installed')
  assert.equal(current.version, pack.version)
  assert.equal(current.installedVersion, pack.version)
  assert.deepEqual(
    await readFile(join(store.root, 'installed', pack.id, pack.version, 'routing.tar')),
    data
  )
  // Same-version installation remains idempotent; replacing a version is explicit.
  await writeFile(catalog, JSON.stringify({ schema_version: 1, packages: [pack] }))
  await store.install(pack.id)
  assert.equal(ranges.length, downloads)
  await store.uninstall(pack.id)
  await writeFile(catalog, JSON.stringify({ schema_version: 1, packages: [newer] }))
  await store.install(pack.id, newer.version)
  const installed = await store.getInstalledPackage(pack.id)
  assert.equal(installed?.version, newer.version)
})

test(
  'an active manifest retains its own version when older deployments contain a newer installed version',
  { skip: process.platform === 'win32' ? 'Production uses Linux symlinks' : false },
  async (t) => {
    const { store, pack, catalog, data } = await fixture(t)
    await store.install(pack.id)
    await store.activate(pack.id)
    // Simulate a pre-upgrade deployment which allowed side-by-side versions.
    const newer = { ...pack, version: '2026.12' }
    const directory = join(store.root, 'installed', pack.id, newer.version)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(newer))
    await writeFile(join(directory, 'routing.tar'), data)
    await writeFile(
      join(store.root, 'state', `${pack.id}.json`),
      JSON.stringify({ manifest: newer, status: 'installed' })
    )
    await writeFile(catalog, JSON.stringify({ schema_version: 1, packages: [newer] }))
    const state = await store.list()
    assert.equal(state.activePackageId, pack.id)
    assert.equal(state.packages[0].version, pack.version)
    assert.equal(state.packages[0].installedVersion, newer.version)
    const active = await store.getActivePackage()
    assert.equal(active?.version, pack.version)
  }
)

test('removing a failed download discards its partial file and state', async (t) => {
  const { store, pack } = await fixture(t)
  const partial = join(store.root, 'staging', pack.id, pack.version, 'routing.tar.part')
  await mkdir(join(store.root, 'staging', pack.id, pack.version), { recursive: true })
  await writeFile(partial, Buffer.from('partial'))
  await store.markQueued(pack)
  await store.markFailed(pack, new Error('Interrupted download'))
  let state = await store.list()
  assert.equal(state.packages[0].status, 'failed')
  await store.uninstall(pack.id, async () => true)
  await assert.rejects(() => stat(partial), { code: 'ENOENT' })
  state = await store.list()
  assert.equal(state.packages[0].status, 'available')
})

test('queued download files are removed only after queue cancellation succeeds', async (t) => {
  const { store, pack } = await fixture(t)
  await store.markQueued(pack)
  await assert.rejects(() => store.uninstall(pack.id, async () => false), /download is running/)
  await assert.rejects(
    () =>
      store.uninstall(pack.id, async () => {
        throw new Error('Worker acquired the job')
      }),
    /Worker acquired/
  )
  let state = await store.list()
  assert.equal(state.packages[0].status, 'downloading')
  await store.uninstall(pack.id, async () => true)
  state = await store.list()
  assert.equal(state.packages[0].status, 'available')
})

test('removal waits for a retry to publish its queue job before cancelling it', async (t) => {
  const { store, pack } = await fixture(t)
  await store.markFailed(pack, new Error('Previous download failed'))
  let enterDispatch!: () => void
  let releaseDispatch!: () => void
  const dispatchEntered = new Promise<void>((resolve) => {
    enterDispatch = resolve
  })
  const dispatchGate = new Promise<void>((resolve) => {
    releaseDispatch = resolve
  })
  let newJobPublished = false
  let cancellationCalled = false
  const retry = store.queueInstall(pack, async () => {
    enterDispatch()
    await dispatchGate
    newJobPublished = true
    return 'new-job'
  })
  await dispatchEntered
  const removal = store.uninstall(pack.id, async () => {
    cancellationCalled = true
    assert.equal(
      newJobPublished,
      true,
      'removal must cancel the new job, not the preceding failed job'
    )
    return true
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(cancellationCalled, false)
  releaseDispatch()
  assert.equal(await retry, 'new-job')
  await removal
  const state = await store.list()
  assert.equal(state.packages[0].status, 'available')
})

test('a queue publication failure records a retryable failure and releases the mutation lock', async (t) => {
  const { store, pack } = await fixture(t)
  await assert.rejects(
    () =>
      store.queueInstall(pack, async () => {
        throw new Error('Queue unavailable')
      }),
    /Queue unavailable/
  )
  let state = await store.list()
  assert.equal(state.packages[0].status, 'failed')
  assert.equal(state.packages[0].error, 'Queue unavailable')
  await store.uninstall(pack.id)
  state = await store.list()
  assert.equal(state.packages[0].status, 'available')
})
