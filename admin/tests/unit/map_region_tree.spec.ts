import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  regionAncestorIds,
  regionBreadcrumb,
  regionTreeRows,
  projectRegionActivities,
  regionHasOwnActivity,
  regionDisplayName,
  countryTerritoryGroups,
  territoryGroupMatches,
  territoryRegionMatches,
  territoryRouteReady,
  territoryRouteProvider,
  routingTerritoryRegion,
  territoryNeedsAttention,
} from '../../inertia/lib/map_region_tree.js'
import type { MapRegionState } from '../../types/map_regions.js'

const regions = [
  { id: 'world', name: 'World' },
  { id: 'south-america', name: 'South America', parentId: 'world' },
  { id: 'brazil', name: 'Brasil', parentId: 'south-america' },
  { id: 'sudeste', name: 'Sudeste', parentId: 'brazil' },
  { id: 'br-addresses-sp', name: 'São Paulo — IBGE', parentId: 'brazil' },
  { id: 'europe', name: 'Europe', parentId: 'world' },
  { id: 'portugal', name: 'Portugal', parentId: 'europe' },
]

test('English display names preserve the source names and geographic proper nouns', () => {
  const source = { id: 'brazil', name: 'Brasil' }
  assert.equal(regionDisplayName(source), 'Brazil')
  assert.equal(source.name, 'Brasil')
  assert.equal(
    regionDisplayName({ id: 'br-addresses-sp', name: 'São Paulo — IBGE' }),
    'São Paulo — IBGE'
  )
  const postal = { id: 'br-addresses-sp', name: 'São Paulo — endereços e CEPs (IBGE)' }
  assert.equal(regionDisplayName(postal), 'São Paulo — postal codes (IBGE)')
  assert.equal(postal.name, 'São Paulo — endereços e CEPs (IBGE)')
  assert.equal(
    regionDisplayName({ id: 'br-addresses-sp', name: 'São Paulo — postal codes (IBGE)' }),
    'São Paulo — postal codes (IBGE)'
  )
})

test('collapsed hierarchy keeps descendants hidden and expansion reveals only provider nodes', () => {
  assert.deepEqual(
    regionTreeRows(regions, new Set()).map((row) => row.region.id),
    ['world']
  )
  const rows = regionTreeRows(regions, new Set(['world', 'south-america', 'brazil']))
  assert.deepEqual(
    rows.map((row) => row.region.id),
    ['world', 'europe', 'south-america', 'brazil', 'br-addresses-sp', 'sudeste']
  )
  assert.equal(rows.find((row) => row.region.id === 'brazil')?.depth, 2)
  assert.equal(rows.find((row) => row.region.id === 'europe')?.expanded, false)
})

test('accent-insensitive search retains ancestor paths without unrelated branches', () => {
  const rows = regionTreeRows(regions, new Set(), 'sao paulo')
  assert.deepEqual(
    rows.map((row) => row.region.id),
    ['world', 'south-america', 'brazil', 'br-addresses-sp']
  )
  assert.equal(rows[0].matched, false)
  assert.equal(rows.at(-1)?.matched, true)
  assert.equal(
    regionBreadcrumb(regions, 'br-addresses-sp'),
    'World / South America / Brasil / São Paulo — IBGE'
  )
})

test('status filtering carries ancestors as context without changing their availability', () => {
  const rows = regionTreeRows(regions, new Set(), '', (region) => region.id === 'portugal')
  assert.deepEqual(
    rows.map((row) => row.region.id),
    ['world', 'europe', 'portugal']
  )
  assert.equal(rows[0].region, regions[0])
  assert.equal(rows[0].matched, false)
  assert.equal(rows[2].matched, true)
})

test('ancestor lookup stays bounded even when given a cyclic draft hierarchy', () => {
  assert.deepEqual(
    regionAncestorIds(
      [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' },
      ],
      'a'
    ),
    ['b']
  )
})

function activityRegions() {
  return regions.map((region) => ({
    ...region,
    coverage: { bbox: [0, 0, 1, 1] },
    sources: {},
    components:
      region.id === 'south-america'
        ? {
            search: {
              status: 'preparing',
              operation: { id: 'south-search', phase: 'reading_source', type: 'install' },
            },
            routing: {
              status: 'queued',
              operation: { id: 'south-routes', phase: 'queued', type: 'install' },
            },
          }
        : region.id === 'portugal'
          ? {
              routing: {
                status: 'downloading',
                operation: { id: 'portugal-routes', phase: 'downloading', type: 'install' },
              },
            }
          : region.id === 'brazil'
            ? {
                search: {
                  status: 'available',
                  pendingProvider: {
                    regionId: 'south-america',
                    name: 'South America',
                    status: 'preparing',
                    component: 'search',
                  },
                },
              }
            : {},
  })) as MapRegionState[]
}

test('collapsed activity counts owning regions once rather than components or covered children', () => {
  const items = activityRegions()
  const projection = projectRegionActivities(items, regionTreeRows(items, new Set()))
  assert.deepEqual(
    projection.byRow.get('world')?.map((region) => region.id),
    ['south-america', 'portugal']
  )
  assert.equal(projection.byRow.size, 1)
  assert.equal(regionHasOwnActivity(items.find((region) => region.id === 'brazil')!), false)
})

test('expansion moves signals into their visible branch while a parent keeps its own job', () => {
  const items = activityRegions()
  const projection = projectRegionActivities(
    items,
    regionTreeRows(items, new Set(['world', 'south-america', 'brazil']))
  )
  assert.equal(projection.byRow.has('world'), false)
  assert.deepEqual(
    projection.byRow.get('europe')?.map((region) => region.id),
    ['portugal']
  )
  assert.deepEqual(
    projection.byRow.get('south-america')?.map((region) => region.id),
    ['south-america']
  )
  assert.equal(projection.byRow.has('brazil'), false)
})

test('independent child attempts remain visible beside the parent without inheriting its activity', () => {
  const items = activityRegions()
  const child = items.find((region) => region.id === 'br-addresses-sp')!
  child.components.search = {
    status: 'failed',
    operation: { id: 'ibge-attempt', phase: 'failed', type: 'install' },
  }
  const projection = projectRegionActivities(
    items,
    regionTreeRows(items, new Set(['world', 'south-america', 'brazil']))
  )
  assert.deepEqual(
    projection.byRow.get('br-addresses-sp')?.map((region) => region.id),
    ['br-addresses-sp']
  )
  assert.deepEqual(
    projection.byRow.get('south-america')?.map((region) => region.id),
    ['south-america']
  )
})

test('filtered-out jobs are surfaced separately rather than counted on unrelated retained ancestors', () => {
  const items = activityRegions()
  const rows = regionTreeRows(items, new Set(), 'portugal')
  const projection = projectRegionActivities(items, rows, true)
  assert.deepEqual(projection.outsideFilter, ['south-america'])
  assert.deepEqual(
    projection.byRow.get('portugal')?.map((region) => region.id),
    ['portugal']
  )
  assert.equal(projection.byRow.has('world'), false)
})

function territory(
  id: string,
  scope: 'country' | 'subregion' | 'collection',
  countries: string[],
  parentId?: string
): MapRegionState {
  return {
    id,
    name: id,
    parentId,
    territoryScope: scope,
    countryCodes: countries,
    coverage: { bbox: [-74, -34, -34, 6] },
    sources:
      scope === 'collection'
        ? {}
        : {
            routing: {
              sourceId: 'geofabrik',
              format: 'osm-pbf',
              url: 'https://download.geofabrik.de/south-america/brazil-latest.osm.pbf',
            },
          },
    components: { routing: { status: 'available' } },
  }
}

test('country-first presentation excludes continents and groups published subregions without inventing download sources', () => {
  const country = territory('test-br-country', 'country', ['BR'])
  country.name = 'Brazil'
  const subregion = territory('test-br-subregion', 'subregion', ['BR'], country.id)
  subregion.name = 'Southeast'
  const onlyPublishedPart = territory('great-britain', 'subregion', ['GB'], 'europe')
  const collection = territory('south-america', 'collection', [])
  const items = [collection, country, subregion, onlyPublishedPart]
  const groups = countryTerritoryGroups(items)
  assert.equal(groups.length, 2)
  const brazil = groups.find((group) => group.countryCode === 'BR')!
  assert.equal(brazil.country, country)
  assert.deepEqual(brazil.regions, [subregion])
  const uk = groups.find((group) => group.countryCode === 'GB')!
  assert.equal(uk.name, 'United Kingdom')
  assert.equal(uk.country, undefined)
  assert.deepEqual(uk.regions, [onlyPublishedPart])
  assert.equal(items.length, 4)
  assert.ok(!groups.some((group) => group.country?.id === collection.id))
  assert.equal(territoryGroupMatches(brazil, items, 'southeast', 'all'), true)
  assert.equal(territoryGroupMatches(brazil, items, 'gb', 'all'), false)
})

test('legacy continental coverage cannot mark a country installed or block its independent routing package', () => {
  const continent = territory('south-america', 'collection', [])
  continent.components.routing = {
    status: 'installed',
    installedVersion: 'old-continent',
    availability: 'direct',
  }
  const country = territory('test-br-country', 'country', ['BR'], continent.id)
  country.components.routing = {
    status: 'installed',
    installedVersion: 'old-continent',
    availability: 'inherited',
    providedBy: {
      regionId: continent.id,
      name: 'South America',
      component: 'routing',
      version: 'old-continent',
      sourceId: 'geofabrik',
      namespace: 'regions',
    },
  }
  country.components.search = { status: 'installed', installedVersion: 'removed-search' }
  const items = [continent, country]
  assert.equal(territoryRouteReady(country, items), false)
  const display = routingTerritoryRegion(country, items)
  assert.equal(display.components.routing?.status, 'available')
  assert.equal(display.components.routing?.providedBy, undefined)
  assert.equal(display.components.search, undefined)
  assert.equal(country.components.search?.installedVersion, 'removed-search')
  assert.equal(country.components.routing?.providedBy?.regionId, continent.id)
  assert.equal(
    territoryGroupMatches(countryTerritoryGroups(items)[0], items, '', 'installed'),
    false
  )
})

test('an installed country legitimately supplies its published subregions, with routing-only workflow presentation', () => {
  const country = territory('test-br-country', 'country', ['BR'])
  country.components.routing = {
    status: 'installed',
    installedVersion: 'country-v1',
    availability: 'direct',
  }
  const child = territory('test-br-child', 'subregion', ['BR'], country.id)
  child.components.routing = {
    status: 'installed',
    availability: 'inherited',
    installedVersion: 'country-v1',
    providedBy: {
      regionId: country.id,
      name: 'Brazil',
      component: 'routing',
      version: 'country-v1',
      sourceId: 'geofabrik',
      namespace: 'regions',
    },
  }
  assert.equal(territoryRouteReady(child, [country, child]), true)
  const group = countryTerritoryGroups([country, child])[0]
  assert.equal(territoryGroupMatches(group, [country, child], '', 'installed'), true)
  country.components.routing = {
    status: 'preparing',
    operation: {
      id: 'route-job',
      type: 'install',
      phase: 'building_routing',
      workflowId: 'old-workflow',
      workflowComponents: ['search', 'routing'],
      activity: 'no_recent_progress',
    },
  }
  const display = routingTerritoryRegion(country, [country, child])
  assert.deepEqual(display.components.routing?.operation?.workflowComponents, ['routing'])
  assert.equal(territoryNeedsAttention(display), false)
  assert.equal(territoryGroupMatches(group, [country, child], '', 'progress'), true)
  country.components.routing = { status: 'failed' }
  assert.equal(territoryNeedsAttention(country), true)
})

test('a directly installed country is its own owner even when API provider metadata names itself', () => {
  const country = territory('brazil', 'country', ['BR'])
  country.name = 'Brasil'
  country.components.routing = {
    status: 'installed',
    availability: 'direct',
    installedVersion: 'br-v1',
    providedBy: {
      regionId: country.id,
      name: 'Brasil',
      component: 'routing',
      version: 'br-v1',
      sourceId: 'geofabrik',
      namespace: 'regions',
    },
    update: { status: 'available' },
  }
  assert.equal(territoryRouteProvider(country), undefined)
  assert.equal(territoryRouteReady(country, [country]), true)
  const display = routingTerritoryRegion(country, [country])
  assert.equal(display.name, 'Brazil')
  assert.equal(display.components.routing?.providedBy, undefined)
  assert.equal(display.components.routing?.installedVersion, 'br-v1')
  assert.equal(display.components.routing?.update?.status, 'available')
  const child = territory('test-br-child', 'subregion', ['BR'], country.id)
  child.components.routing = { ...country.components.routing, availability: 'inherited' }
  const childDisplay = routingTerritoryRegion(child, [country, child])
  assert.equal(territoryRouteProvider(childDisplay)?.regionId, 'brazil')
  assert.equal(territoryRouteProvider(childDisplay)?.name, 'Brazil')
  assert.equal(territoryRouteReady(childDisplay, [country, child]), true)
  assert.equal(country.components.routing.providedBy?.name, 'Brasil')
})

test('a directly installed subregion is ready without requiring a country provider', () => {
  const region = territory('test-us-state', 'subregion', ['US'])
  region.components.routing = {
    status: 'installed',
    availability: 'direct',
    installedVersion: 'state-v1',
    providedBy: {
      regionId: region.id,
      name: 'California',
      component: 'routing',
      version: 'state-v1',
      sourceId: 'geofabrik',
      namespace: 'regions',
    },
  }
  assert.equal(territoryRouteReady(region, [region]), true)
  const display = routingTerritoryRegion(region, [region])
  assert.equal(territoryRouteProvider(display), undefined)
  assert.equal(display.components.routing?.installedVersion, 'state-v1')
  const child = territory('test-us-child', 'subregion', ['US'], region.id)
  child.components.routing = { ...region.components.routing, availability: 'inherited' }
  assert.equal(territoryRouteReady(child, [region, child]), true)
  const unrelated = { ...child, parentId: 'a-different-state' }
  assert.equal(territoryRouteReady(unrelated, [region, unrelated]), false)
})

test('a country and its published regions apply the same text and state filters', () => {
  const country = territory('test-us-country', 'country', ['US'])
  country.name = 'United States'
  const california = territory('test-us-california', 'subregion', ['US'], country.id)
  california.name = 'California'
  california.components.routing = { status: 'installed', installedVersion: 'state-v1' }
  const oregon = territory('test-us-oregon', 'subregion', ['US'], country.id)
  oregon.name = 'Oregon'
  oregon.components.routing = { status: 'preparing' }
  const nevada = territory('test-us-nevada', 'subregion', ['US'], country.id)
  nevada.name = 'Nevada'
  nevada.components.routing = { status: 'failed' }
  const items = [country, california, oregon, nevada]
  const [group] = countryTerritoryGroups(items)

  for (const [filter, match] of [
    ['installed', california],
    ['progress', oregon],
    ['attention', nevada],
  ] as const) {
    assert.equal(territoryGroupMatches(group, items, 'United States', filter), true)
    assert.deepEqual(
      group.regions.filter((region) => territoryRegionMatches(region, items, '', filter)),
      [match]
    )
    assert.equal(territoryRegionMatches(country, items, '', filter), false)
  }
  assert.equal(territoryGroupMatches(group, items, 'Nevada', 'installed'), false)
  assert.equal(territoryGroupMatches(group, items, 'Oregon', 'progress'), true)
})
