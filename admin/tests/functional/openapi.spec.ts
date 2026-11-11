import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import { getDocRegistry } from '#start/openapi/documented'
import { buildOpenApiDocument, resetOpenApiCache } from '#start/openapi/generator'

/**
 * Routes under `/api` that are intentionally NOT part of the documented API
 * surface (the docs machinery itself).
 */
const UNDOCUMENTED_ALLOWLIST = new Set(['GET /api/openapi.json'])

const RELEVANT_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Build a `${METHOD} ${pattern}` key set for a list of route JSON nodes,
 * expanding multi-method routes and dropping HEAD/OPTIONS.
 */
function routeKeys(nodes: { methods: string[]; pattern: string }[]): Set<string> {
  const keys = new Set<string>()
  for (const node of nodes) {
    for (const method of node.methods) {
      if (RELEVANT_METHODS.has(method)) {
        keys.add(`${method} ${node.pattern}`)
      }
    }
  }
  return keys
}

test.group('OpenAPI docs', () => {
  test('maps contracts include the region tree, explicit updates and route schemas', ({
    assert,
  }) => {
    resetOpenApiCache()
    const doc = buildOpenApiDocument()
    for (const [path, method] of [
      ['/api/maps/regions/catalog', 'get'],
      ['/api/maps/regions/install', 'post'],
      ['/api/maps/regions/{regionId}/estimate', 'get'],
      ['/api/maps/regions/cancel', 'post'],
      ['/api/maps/regions/check-updates', 'post'],
      ['/api/maps/regions/update', 'post'],
      ['/api/maps/regions/refresh-catalog', 'post'],
      ['/api/maps/regions/{regionId}/{component}', 'delete'],
      ['/api/maps/routing/coverage', 'get'],
      ['/api/maps/routing/settings', 'get'],
      ['/api/maps/routing/settings', 'put'],
      ['/api/maps/route', 'post'],
    ]) {
      assert.isObject(doc.paths[path]?.[method], `${method} ${path} is not documented`)
      assert.include(doc.paths[path][method].tags, 'maps')
    }
    const install =
      doc.paths['/api/maps/regions/install'].post.requestBody.content['application/json'].schema
    assert.deepEqual(install.properties.components.items.enum, ['routing'])
    assert.equal(install.properties.components.maxItems, 1)
    const request = doc.paths['/api/maps/route'].post.requestBody.content['application/json'].schema
    assert.deepEqual(request.properties.profile.enum, ['auto', 'pedestrian'])
    assert.equal(request.properties.locations.maxItems, 7)
    const routeResponses = doc.paths['/api/maps/route'].post.responses
    const routeError = routeResponses['422'].content['application/json'].schema
    assert.include(routeError.properties.code.enum, 'DISTANCE_LIMIT_EXCEEDED')
    assert.property(routeError.properties, 'engineCode')
    assert.property(routeError.properties, 'distanceLimitMeters')
    assert.property(routeResponses, '504')
    const routeLegs = routeResponses['200'].content['application/json'].schema.properties.legs
    assert.equal(routeLegs.maxItems, 6)
    assert.equal(routeLegs.items.properties.toIndex.maximum, 6)
    assert.property(
      doc.paths['/api/maps/route'].post.responses['200'].content['application/json'].schema
        .properties,
      'geometry'
    )
    assert.property(
      doc.paths['/api/maps/regions/catalog'].get.responses['200'].content['application/json'].schema
        .properties,
      'regions'
    )
  })

  test('generates a structurally valid OpenAPI 3.1 document', ({ assert }) => {
    resetOpenApiCache()
    const doc = buildOpenApiDocument()

    assert.equal(doc.openapi, '3.1.0')
    assert.isString(doc.info.title)
    assert.isString(doc.info.version)
    assert.isAbove(Object.keys(doc.paths).length, 0)

    // Every operation must declare at least one response.
    for (const [path, methods] of Object.entries<any>(doc.paths)) {
      for (const [method, op] of Object.entries<any>(methods)) {
        assert.isObject(op.responses, `${method.toUpperCase()} ${path} is missing responses`)
        assert.isAbove(
          Object.keys(op.responses).length,
          0,
          `${method.toUpperCase()} ${path} has empty responses`
        )
      }
    }
  })

  test('every /api route is documented (completeness gate)', ({ assert }) => {
    // All committed routes under /api.
    const apiRoutes = router.toJSON().root.filter((node) => node.pattern.startsWith('/api'))

    const allApiKeys = routeKeys(apiRoutes)

    // Keys for the routes registered through documented().
    const documentedKeys = routeKeys([...getDocRegistry().keys()].map((route) => route.toJSON()))

    const missing = [...allApiKeys].filter(
      (key) => !documentedKeys.has(key) && !UNDOCUMENTED_ALLOWLIST.has(key)
    )

    assert.deepEqual(
      missing,
      [],
      `These /api routes are missing a documented() descriptor:\n  ${missing.join('\n  ')}`
    )
  })
})
