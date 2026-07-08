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
        assert.isAbove(Object.keys(op.responses).length, 0, `${method.toUpperCase()} ${path} has empty responses`)
      }
    }
  })

  test('every /api route is documented (completeness gate)', ({ assert }) => {
    // All committed routes under /api.
    const apiRoutes = router
      .toJSON()
      .root.filter((node) => node.pattern.startsWith('/api'))

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
