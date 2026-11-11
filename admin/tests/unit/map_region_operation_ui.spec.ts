import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatOperationDuration,
  operationAge,
  operationIntentLabel,
  operationPhaseLabel,
  operationWaitingLabel,
  regionNeedsAttention,
  searchImprovementOwners,
  regionOperationPresentation,
  operationStepProgress,
  operationWorkLabel,
} from '../../inertia/lib/map_region_operation_ui.js'
import type { MapRegionState } from '../../types/map_regions.js'

test('search improvement summary counts the owner once and keeps inherited children out', () => {
  const owner = {
    id: 'south-america',
    name: 'South America',
    components: {
      search: { status: 'installed', searchUpgradeAvailable: true, searchSourceCached: true },
    },
  } as MapRegionState
  const child = {
    id: 'brazil',
    components: {
      search: {
        status: 'available',
        searchUpgradeAvailable: true,
        providedBy: { regionId: 'south-america' },
      },
    },
  } as MapRegionState
  assert.deepEqual(searchImprovementOwners([owner, child]), [owner])
})

test('operation labels preserve offline improvement intent and distinguish waiting from activity', () => {
  assert.equal(
    operationIntentLabel({ status: 'failed', searchRebuilding: true, installedVersion: 'old' }),
    'Updating postal data'
  )
  assert.equal(operationIntentLabel({ status: 'failed', updating: true }), 'Updating offline data')
  assert.equal(operationPhaseLabel('queued'), 'Waiting in queue')
  assert.equal(operationPhaseLabel('building_search'), 'Building postal lookup indexes')
  assert.equal(
    operationWaitingLabel({
      status: 'queued',
      operation: { id: '1', type: 'index_upgrade', phase: 'queued', queueReason: 'preparer_busy' },
    }),
    'Waiting for the local preparation service.'
  )
  assert.equal(
    regionNeedsAttention({
      components: {
        search: {
          status: 'preparing',
          operation: {
            id: '1',
            type: 'index_upgrade',
            phase: 'building_search',
            activity: 'no_recent_progress',
          },
        },
      },
    }),
    true
  )
  assert.equal(regionNeedsAttention({ components: { search: { status: 'preparing' } } }), false)
})

const flow = (status: 'queued' | 'preparing' | 'installed' | 'failed', phase: string) => ({
  status,
  operation: {
    id: 'operation',
    type: 'install' as const,
    phase,
    workflowId: 'workflow',
    workflowComponents: ['search', 'routing'] as ('search' | 'routing')[],
    sourceMode: 'cached' as const,
    activity: status === 'queued' ? ('waiting' as const) : ('active' as const),
  },
})

test('a combined workflow has one coherent five-step timeline while routes wait for search', () => {
  const result = regionOperationPresentation({
    search: flow('preparing', 'reading_source'),
    routing: flow('queued', 'queued'),
  })
  assert.equal(result.title, 'Preparing postal lookup')
  assert.equal(result.step, 3)
  assert.equal(result.allReady, false)
  assert.deepEqual(
    result.stages.map(({ id, status }) => [id, status]),
    [
      ['download', 'complete'],
      ['verify', 'complete'],
      ['search', 'current'],
      ['routing', 'pending'],
      ['publish', 'pending'],
    ]
  )
  assert.equal(result.stages[0].label, 'Source available locally')
})

test('published search stays visibly ready while routes prepare, then all selected components become ready', () => {
  const components = {
    search: flow('installed', 'ready'),
    routing: flow('preparing', 'building_routing'),
  }
  const partial = regionOperationPresentation(components)
  assert.equal(partial.title, 'Preparing routes')
  assert.equal(partial.readiness, 'Postal data ready · Routes preparing')
  assert.equal(partial.step, 4)
  assert.equal(partial.allReady, false)
  const finished = regionOperationPresentation({
    ...components,
    routing: flow('installed', 'ready'),
  })
  assert.equal(finished.title, 'Ready offline')
  assert.equal(finished.step, 5)
  assert.equal(finished.allReady, true)
  assert.ok(finished.stages.every((stage) => stage.status === 'complete'))
})

test('a missing workflow sibling cannot make a partly refreshed catalog look ready', () => {
  const result = regionOperationPresentation({
    search: flow('installed', 'ready'),
    routing: { status: 'available' },
  })
  assert.equal(result.allReady, false)
  assert.equal(result.unknown, true)
  assert.equal(result.title, 'Status unavailable')
  assert.equal(result.stages.find((stage) => stage.id === 'routing')?.status, 'pending')
})

test('a routing-only request omits search and a failed prerequisite stays ahead of its queued dependent', () => {
  const routingOnly = flow('preparing', 'building_routing')
  routingOnly.operation.workflowComponents = ['routing']
  const routing = regionOperationPresentation({
    routing: routingOnly,
    search: { status: 'available' },
  })
  assert.deepEqual(
    routing.stages.map((stage) => stage.id),
    ['download', 'verify', 'routing', 'publish']
  )
  assert.equal(routing.step, 3)
  const blocked = regionOperationPresentation({
    search: flow('failed', 'failed'),
    routing: flow('queued', 'queued'),
  })
  assert.equal(blocked.title, 'Needs attention')
  assert.equal(blocked.focus?.component, 'search')
  assert.equal(blocked.waiting, false)
  assert.equal(blocked.stages.find((stage) => stage.id === 'search')?.status, 'failed')
})

test('a cached search-format update has three stages and excludes an unrelated installed graph', () => {
  const result = regionOperationPresentation({
    search: {
      status: 'preparing',
      searchRebuilding: true,
      operation: {
        id: 'upgrade',
        type: 'index_upgrade',
        phase: 'building_search',
        sourceMode: 'cached',
      },
    },
    routing: { status: 'installed', installedVersion: 'previous-graph' },
  })
  assert.deepEqual(
    result.stages.map((stage) => stage.id),
    ['verify', 'search', 'publish']
  )
  assert.equal(result.step, 2)
  assert.equal(result.title, 'Preparing postal lookup')
})

test('independent legacy tasks do not imply that search completed merely because routing advanced', () => {
  const result = regionOperationPresentation({
    search: {
      status: 'preparing',
      operation: { id: 'search', type: 'install', phase: 'reading_source' },
    },
    routing: {
      status: 'preparing',
      operation: { id: 'routing', type: 'install', phase: 'building_routing' },
    },
  })
  assert.equal(result.allReady, false)
  assert.equal(result.parallel, true)
  assert.equal(result.stages.find((stage) => stage.id === 'search')?.status, 'current')
  assert.equal(result.stages.find((stage) => stage.id === 'routing')?.status, 'current')
})

test('separate routing-only and search-only workflows remain visible together in one modular region', () => {
  const routing = flow('queued', 'queued')
  routing.operation.workflowId = 'routing-request'
  routing.operation.workflowComponents = ['routing']
  const search = flow('preparing', 'reading_source')
  search.operation.workflowId = 'search-request'
  search.operation.workflowComponents = ['search']
  const result = regionOperationPresentation({ routing, search })
  assert.deepEqual(
    result.entries.map((entry) => entry.component),
    ['search', 'routing']
  )
  assert.deepEqual(
    result.stages.map((stage) => stage.id),
    ['download', 'verify', 'search', 'routing', 'publish']
  )
  assert.equal(result.stages.find((stage) => stage.id === 'search')?.status, 'current')
  assert.equal(result.stages.find((stage) => stage.id === 'routing')?.status, 'pending')
  assert.equal(result.focus?.component, 'search')
  assert.equal(result.allReady, false)
  assert.equal(result.unknown, false)
  assert.equal(result.independent, true)
})

test('step percentages use measured denominators instead of legacy preparation percentages', () => {
  const state = {
    status: 'preparing' as const,
    progress: 80,
    operation: {
      id: 'search',
      type: 'install' as const,
      phase: 'reading_source',
      recordsProcessed: 25,
    },
  }
  assert.equal(operationStepProgress(state).percent, undefined)
  assert.equal(
    operationStepProgress({ ...state, operation: { ...state.operation, recordsTotal: 100 } })
      .percent,
    25
  )
  const transferred = operationStepProgress({
    status: 'downloading',
    bytesDownloaded: 420,
    totalBytes: 1000,
    operation: { id: 'source', type: 'install', phase: 'downloading', rateBytesPerSecond: 10 },
  })
  assert.equal(transferred.percent, 42)
  assert.equal(transferred.measuredEta, 58)
})

test('waiting and unavailable work never reuse old rates, percentages or time estimates', () => {
  const stale = {
    id: 'search',
    type: 'install' as const,
    phase: 'queued',
    activity: 'waiting' as const,
    stageBytesProcessed: 30,
    stageTotalBytes: 100,
    stageRateBytesPerSecond: 10,
    etaSeconds: 7,
    phaseEtaMinSeconds: 5,
    phaseEtaMaxSeconds: 12,
    etaBasis: 'history' as const,
  }
  const waiting = operationStepProgress({ status: 'queued', operation: stale })
  assert.equal(waiting.percent, undefined)
  assert.equal(waiting.speed, undefined)
  assert.equal(waiting.measuredEta, undefined)
  assert.equal(waiting.etaMinimum, undefined)
  const unavailable = operationStepProgress({
    status: 'preparing',
    operation: { ...stale, phase: 'building_search', activity: 'unavailable' },
  })
  assert.equal(unavailable.percent, undefined)
  assert.equal(unavailable.etaMaximum, undefined)
})

test('phase-time ranges remain optional, local-history labeled and scoped to advancing work', () => {
  const state = {
    status: 'preparing' as const,
    operation: {
      id: 'search',
      type: 'install' as const,
      phase: 'building_search',
      activity: 'active' as const,
      phaseEtaMinSeconds: 60,
      phaseEtaMaxSeconds: 120,
      etaBasis: 'history' as const,
    },
  }
  const result = operationStepProgress(state)
  assert.equal(result.etaMinimum, 60)
  assert.equal(result.etaMaximum, 120)
  assert.equal(result.etaBasis, 'history')
  assert.equal(result.percent, undefined)
  assert.equal(
    operationStepProgress({ ...state, operation: { ...state.operation, phaseEtaMinSeconds: 180 } })
      .etaMinimum,
    undefined
  )
  assert.equal(
    operationStepProgress({
      ...state,
      operation: { ...state.operation, activity: 'no_recent_progress' },
    }).etaMinimum,
    undefined
  )
})

test('a cancelled package and a legitimate queued dependency do not become permanent warning badges', () => {
  assert.equal(regionNeedsAttention({ components: { search: { status: 'cancelled' } } }), false)
  assert.equal(
    regionNeedsAttention({
      components: {
        routing: {
          status: 'queued',
          operation: {
            id: 'wait',
            type: 'install',
            phase: 'queued',
            activity: 'no_recent_progress',
          },
        },
      },
    }),
    false
  )
  assert.equal(
    operationWaitingLabel({
      status: 'queued',
      operation: {
        id: 'wait',
        type: 'install',
        phase: 'queued',
        queueReason: 'workflow_dependency',
      },
    }),
    'Postal preparation will finish before route preparation starts.'
  )
  assert.equal(
    operationWaitingLabel({
      status: 'queued',
      operation: {
        id: 'wait',
        type: 'install',
        phase: 'queued',
        queueReason: 'workflow_dependency_failed',
        waitingFor: 'Postal preparation needs attention',
      },
    }),
    'Postal preparation needs attention before route preparation can continue.'
  )
  assert.equal(regionNeedsAttention({ components: { search: { status: 'failed' } } }), true)
})

test('operation ages reject missing timestamps and never invent negative durations', () => {
  assert.equal(operationAge(undefined), null)
  assert.equal(operationAge('not a date'), null)
  assert.equal(
    operationAge('2026-01-01T00:01:00Z', Date.parse('2026-01-01T00:00:00Z')),
    '0 sec ago'
  )
  assert.equal(formatOperationDuration(3660), '1 hr 1 min')
  assert.equal(formatOperationDuration(NaN), 'unknown')
})

test('reported indexing and routing substeps have human labels while unknown or stale details fall back to their phase', () => {
  const cases = [
    ['building_search', 'secondary_indexes', 'Building address lookup indexes'],
    ['building_search', 'rtree', 'Indexing places for nearby searches'],
    ['building_search', 'fts', 'Building text search'],
    ['reading_source', 'osm_two_pass_geometry_and_features', 'Reading map geometry and places'],
    ['reading_source', 'cnefe_rows', 'Reading addresses and postal codes'],
    ['building_routing', 'routing_admins', 'Preparing administrative boundaries for routes'],
    ['building_routing', 'routing_tiles', 'Building the road network for routes'],
    ['building_routing', 'routing_extract', 'Packaging the offline route graph'],
  ]
  for (const [phase, detail, label] of cases) assert.equal(operationWorkLabel(phase, detail), label)
  assert.equal(
    operationWorkLabel('building_search', 'future_unknown_substep'),
    'Building postal lookup indexes'
  )
  assert.equal(operationWorkLabel('queued', 'fts'), 'Waiting in queue')
  assert.equal(operationWorkLabel('reading_source'), 'Reading map data')
})

test('empty postal data is verified without implying lookup coverage or blocking route readiness', () => {
  const search = {
    ...flow('installed', 'ready'),
    postalCoverage: 'empty' as const,
    postalCountries: [],
    records: 0,
  }
  const onlySearch = regionOperationPresentation({
    search: { ...search, operation: { ...search.operation, workflowComponents: ['search'] } },
  })
  assert.equal(onlySearch.allReady, true)
  assert.equal(onlySearch.title, 'No postal codes in this source')
  const complete = regionOperationPresentation({ search, routing: flow('installed', 'ready') })
  assert.equal(complete.allReady, true)
  assert.match(complete.readiness!, /Postal data has no postal codes in this source/)
  assert.match(complete.readiness!, /Routes ready/)
})

test('postal preparation labels explain the new exact-code phases in English', () => {
  assert.equal(
    operationWorkLabel('reading_source', 'cnefe_postal_rows'),
    'Reading postal codes from the IBGE source'
  )
  assert.equal(
    operationWorkLabel('reading_source', 'osm_postal_features'),
    'Reading postal codes from the map source'
  )
  assert.equal(
    operationWorkLabel('building_search', 'postal_groups'),
    'Grouping and indexing complete postal codes'
  )
  assert.equal(
    operationWorkLabel('validating', 'postal_integrity'),
    'Checking postal lookup integrity'
  )
})
