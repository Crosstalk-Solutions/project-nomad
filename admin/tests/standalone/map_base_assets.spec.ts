import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, copyFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { mock, test, type TestContext } from 'node:test'
import { create as createTar } from 'tar'

// Exercise the real MapService filesystem/provisioning methods. Only external
// boundaries (database, queue, download transport and pmtiles process) are fake.
type Fixture = {
  root: string; tar: string; downloads: number; extracts: number; metadata: number
  installed: string[]; activeUrls: Set<string>; dispatched: string[]; warnings: string[]
  resources: { id: string; version: string; url: string }[]
  downloadGate?: Promise<void>; failDownload?: boolean; failExtract?: boolean; failDispatchUrl?: string
}
const fixtures = new Map<string, Fixture>()
let current: Fixture
mock.module('@adonisjs/core/services/logger', { defaultExport: {
  info() {}, error() {}, warn(message: string) { current.warnings.push(String(message)) },
} })
mock.module('#start/env', { defaultExport: { get(key: string) { return key === 'PORT' ? 8082 : undefined } } })
mock.module('#models/installed_resource', { defaultExport: {
  query() { return { async where() { return current.installed.map((resource_id) => ({ resource_id })) } } },
} })
mock.module('#jobs/run_download_job', { namedExports: { RunDownloadJob: {
  async getActiveByUrl(url: string) { return current.activeUrls.has(url) ? { id: 'existing' } : undefined },
  async dispatch(data: { url: string }) {
    if (data.url === current.failDispatchUrl) throw new Error('Synthetic queue rejection')
    current.dispatched.push(data.url)
    return { job: { id: 'synthetic-' + current.dispatched.length } }
  },
} } })
mock.module('#jobs/run_extract_pmtiles_job', { namedExports: { RunExtractPmtilesJob: {} } })
mock.module(new URL('../../app/services/collection_manifest_service.js', import.meta.url).href, {
  namedExports: { CollectionManifestService: class {
    async getSpecWithFallback() { return { collections: [{ slug: 'fixture', resources: current.resources }] } }
  } },
})
mock.module(new URL('../../app/utils/downloads.js', import.meta.url).href, { namedExports: {
  async doResumableDownloadWithRetry({ filepath }: { filepath: string }) {
    const fixture = fixtures.get(dirname(filepath))!
    assert.ok(fixture, 'Only the private test directory can receive base assets')
    fixture.downloads += 1
    if (fixture.downloadGate) await fixture.downloadGate
    if (fixture.failDownload) throw new Error('Synthetic offline transport failure')
    await copyFile(fixture.tar, filepath)
  },
} })
mock.module('axios', { defaultExport: {
  async get() {
    current.metadata += 1
    return { data: [{ key: '20261127.pmtiles', size: 1024 }] }
  },
} })
mock.module('child_process', { namedExports: {
  execFile(_binary: string, args: string[], _options: unknown, callback: (error: Error | null, stdout?: string, stderr?: string) => void) {
    const fixture = fixtures.get(dirname(dirname(args[2])))!
    assert.ok(fixture, 'Only the private test directory can receive the world basemap')
    assert.equal(args[0], 'extract')
    assert.ok(args.includes('--maxzoom=5'))
    fixture.extracts += 1
    if (fixture.failExtract) { callback(new Error('Synthetic extractor failure')); return }
    const header = Buffer.alloc(127)
    header.write('PMTiles', 0); header[7] = 3; header[99] = 1; header[100] = 0; header[101] = 5
    void writeFile(args[2], header).then(() => callback(null, '', ''), callback)
  },
} })

const { MapService } = await import('../../app/services/map_service.js')

async function fixture(context: TestContext): Promise<Fixture> {
  const parent = await mkdtemp(join(tmpdir(), 'nomad-base-assets-'))
  context.after(async () => {
    fixtures.delete(join(parent, 'maps'))
    await rm(parent, { recursive: true, force: true })
  })
  const bundle = join(parent, 'bundle', 'map-assets')
  const root = join(parent, 'maps')
  await mkdir(root)
  await mkdir(join(bundle, 'basemaps-assets', 'fonts', 'Noto Sans Regular'), { recursive: true })
  await mkdir(join(bundle, 'basemaps-assets', 'sprites', 'v4'), { recursive: true })
  await writeFile(join(bundle, 'nomad-base-styles.json'), JSON.stringify({
    version: 8, sources: {}, sprite: '', glyphs: '',
    layers: [{ id: 'background', type: 'background' },
      { id: 'land', type: 'fill', source: 'base', 'source-layer': 'landcover' }],
  }))
  await writeFile(join(bundle, 'basemaps-assets', 'fonts', 'Noto Sans Regular', '0-255.pbf'), Buffer.from([0x0a, 0]))
  await writeFile(join(bundle, 'basemaps-assets', 'sprites', 'v4', 'light.json'), '{}')
  await writeFile(join(bundle, 'basemaps-assets', 'sprites', 'v4', 'light.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
  const tar = join(parent, 'fixture.tar.gz')
  await createTar({ cwd: join(parent, 'bundle'), file: tar, gzip: true }, ['map-assets'])
  const result: Fixture = { root, tar, downloads: 0, extracts: 0, metadata: 0,
    installed: [], activeUrls: new Set(), dispatched: [], warnings: [],
    resources: [{ id: 'region', version: '1', url: 'https://fixture.example/region.pmtiles' }],
  }
  fixtures.set(root, result)
  current = result
  return result
}

function instance(fixture: Fixture) {
  const service = new MapService()
  // Private test roots keep all generated archives away from installed maps.
  Object.assign(service, { baseDirPath: fixture.root, mapStoragePath: relative(process.cwd(), fixture.root) })
  return service
}

async function until(predicate: () => boolean, message: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(message)
}

test('collection admission provisions assets before any map visit and shared instances render them offline', async (context) => {
  const data = await fixture(context)
  let release!: () => void
  data.downloadGate = new Promise((resolve) => { release = resolve })
  const services = [instance(data), instance(data), instance(data)]
  const filenames = await Promise.all(services.map((service) => service.downloadCollection('fixture')))
  assert.deepEqual(filenames, [['region.pmtiles'], ['region.pmtiles'], ['region.pmtiles']])
  assert.equal(data.dispatched.length, 3, 'Admission does not wait for downloading base assets')
  await until(() => data.downloads === 1, 'The first admission should start background provisioning')
  assert.equal(data.extracts, 0)
  release()
  await Promise.all(services.map((service) => service.ensureBaseAssets()))
  assert.equal(data.downloads, 1)
  assert.equal(data.extracts, 1)
  assert.equal(data.metadata, 1)
  for (const service of services) {
    const styles = await service.generateStylesJSON('nomad.test:8082')
    assert.ok(styles.sources.world)
    assert.match(styles.sources.world.url, /world\.pmtiles$/)
    assert.ok(styles.layers.some((layer) => layer.source === 'world'))
    assert.match(styles.glyphs, /fonts\/\{fontstack\}\/\{range\}\.pbf$/)
  }
  // A new request after restart needs neither the provider nor the extractor.
  data.failDownload = true; data.failExtract = true
  const restarted = instance(data)
  assert.equal(await restarted.ensureBaseAssets(), true)
  const offline = await restarted.generateStylesJSON('nomad.test:8082')
  assert.ok(offline.sources.world)
  assert.equal(data.downloads, 1); assert.equal(data.extracts, 1); assert.equal(data.metadata, 1)
  assert.equal(await readFile(join(data.root, 'basemaps-assets', 'sprites', 'v4', 'light.json'), 'utf8'), '{}')
  assert.ok((await stat(join(data.root, 'basemaps-assets', 'fonts', 'Noto Sans Regular', '0-255.pbf'))).size)
})

test('background base-asset failure preserves admission and releases the shared guard for retry', async (context) => {
  const data = await fixture(context)
  data.failDownload = true
  const service = instance(data)
  assert.deepEqual(await service.downloadCollection('fixture'), ['region.pmtiles'])
  await until(() => data.warnings.some((message) => message.includes('Base map provisioning')), 'The failure must be recorded')
  assert.equal(data.dispatched.length, 1)
  data.failDownload = false
  assert.equal(await service.ensureBaseAssets(), true)
  assert.equal(data.downloads, 2)
  assert.equal(data.extracts, 1)
  assert.ok((await service.generateStylesJSON('nomad.test')).sources.world)
})

test('world extraction failure remains retryable for every waiting instance', async (context) => {
  const data = await fixture(context)
  data.failExtract = true
  const first = instance(data), second = instance(data)
  assert.deepEqual(await Promise.all([first.ensureBaseAssets(), second.ensureBaseAssets()]), [true, true])
  assert.equal(data.downloads, 1); assert.equal(data.extracts, 1)
  assert.equal(await first.checkWorldBasemapExists(), false)
  data.failExtract = false
  await Promise.all([first.ensureBaseAssets(), second.ensureBaseAssets()])
  assert.equal(data.downloads, 1); assert.equal(data.extracts, 2)
  assert.ok((await first.generateStylesJSON('nomad.test')).sources.world)
  assert.ok((await second.generateStylesJSON('nomad.test')).sources.world)
})

test('an older instance does not keep a negative cache after another request provisions assets', async (context) => {
  const data = await fixture(context)
  const older = instance(data)
  data.failDownload = true
  await assert.rejects(older.ensureBaseAssets(), /Synthetic offline transport failure/)
  data.failDownload = false
  const other = instance(data)
  assert.equal(await other.ensureBaseAssets(), true)
  assert.equal(data.downloads, 2)
  data.failDownload = true
  assert.equal(await older.ensureBaseAssets(), true)
  assert.equal(data.downloads, 2, 'Existing base assets must not be downloaded a third time')
  assert.equal(data.extracts, 1)
  assert.ok((await older.generateStylesJSON('nomad.test')).sources.world)
})

test('nothing is provisioned for installed, active, blocked or unknown collections', async (context) => {
  const data = await fixture(context)
  data.installed = ['region']
  assert.equal(await instance(data).downloadCollection('fixture'), null)
  data.installed = []
  data.activeUrls.add(data.resources[0].url)
  assert.equal(await instance(data).downloadCollection('fixture'), null)
  data.activeUrls.clear()
  data.resources[0].url = 'http://127.0.0.1/blocked.pmtiles'
  assert.equal(await instance(data).downloadCollection('fixture'), null)
  assert.equal(await instance(data).downloadCollection('unknown'), null)
  assert.equal(data.dispatched.length, 0); assert.equal(data.downloads, 0); assert.equal(data.extracts, 0)
})

test('a later queue failure does not lose provisioning for an already admitted collection resource', async (context) => {
  const data = await fixture(context)
  data.resources.push({ id: 'other', version: '1', url: 'https://fixture.example/other.pmtiles' })
  data.failDispatchUrl = data.resources[1].url
  const service = instance(data)
  await assert.rejects(service.downloadCollection('fixture'), /Synthetic queue rejection/)
  await service.ensureBaseAssets()
  assert.equal(data.dispatched.length, 1); assert.equal(data.downloads, 1); assert.equal(data.extracts, 1)
})
