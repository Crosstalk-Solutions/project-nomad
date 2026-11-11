import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { MapRegionState } from '../../types/map_regions.js'
import {
  activeRegionOperations,
  downloadableRegionComponents,
  pendingRegionMessage,
  regionOperationComponents,
  regionOperationLabel,
  regionTransfer,
  regionOperationsNeedingAttention,
} from '../../inertia/lib/map_region_downloads.js'

const source = {
  url: 'https://download.geofabrik.de/central-america-latest.osm.pbf',
  sourceId: 'geofabrik' as const,
  format: 'osm-pbf' as const,
}
const region = (): MapRegionState => ({
  id: 'central-america',
  name: 'Central America',
  coverage: { bbox: [-120, -10, -50, 30] },
  sources: { routing: source, search: { ...source } },
  components: {
    routing: {
      status: 'downloading',
      availability: 'available',
      bytesDownloaded: 200,
      totalBytes: 1000,
    },
    search: { status: 'queued', availability: 'available' },
  },
})

test('one region operation represents a shared source without counting its bytes twice', () => {
  const current = region()
  current.components.search = { status: 'preparing', bytesDownloaded: 1000, totalBytes: 1000 }
  assert.deepEqual(regionTransfer(current), {
    bytes: 1000,
    total: 1000,
    shared: true,
    sourceCount: 1,
  })
  current.sources.search = { ...source, url: 'https://example.org/separate.zip' }
  assert.deepEqual(regionTransfer(current), {
    bytes: 1200,
    total: 2000,
    shared: false,
    sourceCount: 2,
  })
})

test('a queued replacement cannot make an active source look fully downloaded', () => {
  const current = region()
  current.components.search = {
    status: 'queued',
    progress: 0,
    bytesDownloaded: 5000,
    totalBytes: 5000,
  }
  assert.deepEqual(regionTransfer(current), {
    bytes: 200,
    total: 1000,
    shared: true,
    sourceCount: 1,
  })
})

test('downloaded sources still appear active while preparing and validating', () => {
  const current = region()
  current.components = {
    routing: { status: 'preparing', bytesDownloaded: 1000, totalBytes: 1000, progress: 20 },
  }
  assert.equal(regionTransfer(current).bytes, 1000)
  assert.deepEqual(activeRegionOperations([current]), [current])
  assert.match(regionOperationLabel('preparing'), /Preparing and validating/)
  current.components.routing!.status = 'cancelling'
  assert.deepEqual(regionOperationComponents(current), ['routing'])
  assert.equal(regionOperationLabel('cancelling'), 'Cancelling…')
  current.components.routing!.status = 'cancelled'
  assert.deepEqual(activeRegionOperations([current]), [])
})

test('children pending in an ancestor cannot start redundant component downloads', () => {
  const child = region()
  child.id = 'belize'
  child.name = 'Belize'
  child.components = {
    routing: {
      status: 'available',
      availability: 'available',
      pendingProvider: {
        regionId: 'central-america',
        name: 'Central America',
        component: 'routing',
        status: 'downloading',
      },
    },
    search: { status: 'available', availability: 'available' },
  }
  assert.deepEqual(downloadableRegionComponents(child, ['routing', 'search']), ['search'])
  assert.match(pendingRegionMessage(child.components.routing)!, /Included in Central America/)
  assert.equal(activeRegionOperations([region(), child]).length, 1)
  child.components.routing!.pendingProvider!.status = 'cancelling'
  assert.deepEqual(downloadableRegionComponents(child, ['routing']), [])
  delete child.components.routing!.pendingProvider
  assert.deepEqual(downloadableRegionComponents(child, ['routing']), ['routing'])
})

test('a missing installed artifact can be downloaded again despite stale version fields', () => {
  const current = region()
  current.components = {
    routing: { status: 'available', availability: 'available', installedVersion: 'old' },
    search: { status: 'installed', availability: 'inherited' },
  }
  assert.deepEqual(downloadableRegionComponents(current, ['routing', 'search']), ['routing'])
  current.components.routing = {
    status: 'cancelled',
    availability: 'direct',
    installedVersion: 'previous-verified-version',
  }
  assert.deepEqual(downloadableRegionComponents(current, ['routing']), [])
})

test('unknown source totals remain unknown instead of becoming a misleading zero', () => {
  const current = region()
  current.components.routing!.totalBytes = undefined
  assert.deepEqual(regionTransfer(current), {
    bytes: 200,
    total: undefined,
    shared: true,
    sourceCount: 1,
  })
})

test('failed operations stay visible for retry while inherited child failures do not duplicate owner work', () => {
  const current = region()
  current.components = {
    routing: {
      status: 'failed',
      availability: 'direct',
      installedVersion: 'previous',
      error: 'Interrupted preparation',
    },
  }
  assert.deepEqual(activeRegionOperations([current]), [])
  assert.deepEqual(regionOperationsNeedingAttention([current]), [current])
  current.components.routing!.pendingProvider = {
    regionId: 'parent',
    name: 'Parent',
    component: 'routing',
    status: 'downloading',
  }
  assert.deepEqual(regionOperationsNeedingAttention([current]), [])
  delete current.components.routing!.pendingProvider
  current.components.routing!.availability = 'inherited'
  assert.deepEqual(regionOperationsNeedingAttention([current]), [])
})
