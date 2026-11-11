import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Markdoc from '@markdoc/markdoc'
import { mapOfflineRouteValidator, mapRegionRequestValidator } from '../../app/validators/maps.js'
import { mapRegionsResponse, mapRouteResponse } from '../../app/validators/responses/maps.js'

test('the offline maps guide parses with the bundled Markdown engine', async () => {
  const content = await readFile(new URL('../../docs/maps.md', import.meta.url), 'utf8')
  const errors = Markdoc.validate(Markdoc.parse(content)).filter(
    (item) => item.error.id !== 'attribute-undefined'
  )
  assert.deepEqual(errors, [])
  for (const link of ['/settings/maps#offline-regions', '/reference#tag/maps', '/api/openapi.json'])
    assert.ok(content.includes(link))
})

test('the API reference parses with the bundled Markdown engine', async () => {
  const content = await readFile(new URL('../../docs/api-reference.md', import.meta.url), 'utf8')
  const errors = Markdoc.validate(Markdoc.parse(content)).filter(
    (item) => item.error.id !== 'attribute-undefined'
  )
  assert.deepEqual(errors, [])
  assert.ok(content.includes('/api/maps/regions/install'))
  assert.ok(content.includes('/api/maps/route'))
})

test('map request contracts expose real component names, travel modes and coordinate bounds', async () => {
  assert.deepEqual(
    await mapRegionRequestValidator.validate({
      regionId: 'brazil',
      components: ['routing'],
    }),
    { regionId: 'brazil', components: ['routing'] }
  )
  await assert.rejects(
    mapRegionRequestValidator.validate({ regionId: '../outside', components: ['routing'] })
  )
  await assert.rejects(
    mapRegionRequestValidator.validate({ regionId: 'brazil', components: ['imagery'] })
  )
  await assert.rejects(
    mapOfflineRouteValidator.validate({
      automatic: true,
      profile: 'auto',
      locations: [
        { lat: 91, lon: 0 },
        { lat: 0, lon: 0 },
      ],
    })
  )
  await assert.rejects(
    mapRegionRequestValidator.validate({ regionId: 'brazil', components: ['search'] })
  )
  await assert.rejects(
    mapRegionRequestValidator.validate({ regionId: 'brazil', components: ['routing', 'routing'] })
  )
  const installation = mapRegionRequestValidator.toJSONSchema() as any
  assert.deepEqual(installation.properties.components.items.enum, ['routing'])
  assert.equal(installation.properties.components.maxItems, 1)
  const route = mapOfflineRouteValidator.toJSONSchema() as any
  assert.deepEqual(route.properties.profile.enum, ['auto', 'pedestrian'])
  assert.equal(route.properties.locations.minItems, 2)
  assert.equal(route.properties.locations.maxItems, 7)
  assert.ok(route.properties.packageVersion)
})

test('response contracts distinguish availability, preparation and source freshness', () => {
  const schema = mapRegionsResponse.toJSONSchema() as any
  const component = schema.properties.regions.items.properties.components.properties.routing
  assert.ok(component.properties.status)
  assert.equal(schema.properties.regions.items.properties.components.properties.search, undefined)
  assert.equal(schema.properties.searchBuilderReady, undefined)
  assert.deepEqual(component.properties.availability.enum, [
    'direct',
    'inherited',
    'available',
    'unavailable',
  ])
  assert.ok(component.properties.providedBy.properties.version)
  assert.ok(component.properties.dependents)
  assert.ok(component.properties.pendingProvider.properties.regionId)
  assert.ok(component.properties.status.enum.includes('cancelling'))
  assert.ok(component.properties.status.enum.includes('cancelled'))
  assert.deepEqual(component.properties.update.properties.status.enum, [
    'not_checked',
    'up_to_date',
    'available',
    'unknown',
    'unavailable',
  ])
  assert.deepEqual(component.properties.update.properties.evidence.enum, ['checksum', 'metadata'])
  const route = mapRouteResponse.toJSONSchema() as any
  assert.ok(route.properties.distanceMeters)
  assert.ok(route.properties.durationSeconds)
  assert.equal(route.properties.legs.minItems, 1)
  assert.equal(route.properties.legs.maxItems, 6)
  assert.ok(route.properties.legs.items.properties.fromIndex)
  assert.ok(route.properties.legs.items.properties.toIndex)
  assert.ok(route.properties.legs.items.properties.maneuvers)
  assert.equal(route.properties.geometry.properties.type.enum[0], 'LineString')
})
