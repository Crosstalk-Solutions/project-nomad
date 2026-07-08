/*
|--------------------------------------------------------------------------
| OpenAPI document generator
|--------------------------------------------------------------------------
|
| Assembles an OpenAPI 3.1 document from the `documented()` registry. Request,
| query, param, and response schemas are produced by VineJS's native
| `validator.toJSONSchema()` (JSON Schema Draft 7), which is a compatible
| subset of the JSON Schema dialect OpenAPI 3.1 uses — so almost no
| transformation is required beyond stripping the `$schema` keyword.
|
| The document is built lazily and cached, since routes and validators are
| static once the app has booted.
|
*/
import { SystemService } from '#services/system_service'
import { getDocRegistry, type AnyValidator, type DocDescriptor, type ResponseDoc } from './documented.js'

type JsonObject = Record<string, any>

/**
 * OpenAPI methods we emit operations for. `HEAD` (auto-added by Adonis
 * alongside `GET`) and `OPTIONS` are skipped.
 */
const DOCUMENTED_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])
const BODY_METHODS = new Set(['post', 'put', 'patch', 'delete'])

let cached: JsonObject | null = null

/**
 * Build (or return the cached) OpenAPI 3.1 document for all documented routes.
 */
export function buildOpenApiDocument(force = false): JsonObject {
  if (cached && !force) {
    return cached
  }

  const paths: JsonObject = {}
  const tagSet = new Set<string>()

  for (const [route, descriptor] of getDocRegistry()) {
    const json = route.toJSON()
    const oaPath = toOpenApiPath(json.pattern)
    const methods = json.methods.map((m) => m.toLowerCase()).filter((m) => DOCUMENTED_METHODS.has(m))

    for (const method of methods) {
      const operation = buildOperation(descriptor, oaPath, method)
      for (const tag of operation.tags ?? []) {
        tagSet.add(tag)
      }
      paths[oaPath] = paths[oaPath] ?? {}
      paths[oaPath][method] = operation
    }
  }

  cached = {
    openapi: '3.1.0',
    info: {
      title: 'Nomad Admin API',
      description:
        'HTTP API for the Nomad admin appliance. Generated from the application ' +
        'routes and VineJS validators — see `/reference` for the interactive UI.',
      version: SystemService.getAppVersion(),
    },
    servers: [{ url: '/', description: 'This appliance' }],
    tags: [...tagSet].sort().map((name) => ({ name })),
    paths,
  }

  return cached
}

/**
 * Clear the cached document (used after HMR or in tests that need a rebuild).
 */
export function resetOpenApiCache(): void {
  cached = null
}

/**
 * Build a single OpenAPI operation object.
 */
function buildOperation(descriptor: DocDescriptor, oaPath: string, method: string): JsonObject {
  const operation: JsonObject = {
    operationId: operationId(method, oaPath),
  }

  if (descriptor.summary) operation.summary = descriptor.summary
  if (descriptor.description) operation.description = descriptor.description
  if (descriptor.tags?.length) operation.tags = descriptor.tags

  const parameters = [
    ...pathParameters(oaPath, descriptor.params),
    ...queryParameters(descriptor.query),
  ]
  if (parameters.length) operation.parameters = parameters

  if (descriptor.request && BODY_METHODS.has(method)) {
    const schema = normalizeSchema(descriptor.request.toJSONSchema())
    operation.requestBody = {
      required: Array.isArray(schema.required) && schema.required.length > 0,
      content: { 'application/json': { schema } },
    }
  }

  operation.responses = buildResponses(descriptor.responses)

  return operation
}

/**
 * Path parameters come from the pattern itself (always required); their schema
 * is taken from the `params` validator when provided, otherwise defaulted to a
 * plain string.
 */
function pathParameters(oaPath: string, paramsValidator?: AnyValidator): JsonObject[] {
  const names = [...oaPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
  if (names.length === 0) return []

  const schemas = paramsValidator ? unwrapParamsSchema(paramsValidator) : {}

  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: schemas[name] ? normalizeSchema(schemas[name]) : { type: 'string' },
  }))
}

/**
 * Each top-level property of the query validator becomes a query parameter.
 */
function queryParameters(queryValidator?: AnyValidator): JsonObject[] {
  if (!queryValidator) return []

  const schema = queryValidator.toJSONSchema()
  const properties: JsonObject = schema.properties ?? {}
  const required: string[] = Array.isArray(schema.required) ? schema.required : []

  return Object.entries(properties).map(([name, propSchema]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema: normalizeSchema(propSchema as JsonObject),
  }))
}

/**
 * Build the `responses` object. Defaults to a bare 200 when none are declared.
 */
function buildResponses(responses?: DocDescriptor['responses']): JsonObject {
  if (!responses || Object.keys(responses).length === 0) {
    return { '200': { description: 'Successful response' } }
  }

  const out: JsonObject = {}
  for (const [code, value] of Object.entries(responses)) {
    const doc = normalizeResponse(value)
    const entry: JsonObject = { description: doc.description ?? 'Response' }
    if (doc.schema) {
      entry.content = { 'application/json': { schema: normalizeSchema(doc.schema.toJSONSchema()) } }
    }
    out[code] = entry
  }
  return out
}

/**
 * Accept either a bare validator or a `{ description, schema }` object.
 */
function normalizeResponse(value: ResponseDoc | AnyValidator): ResponseDoc {
  if (value && typeof (value as AnyValidator).toJSONSchema === 'function') {
    return { schema: value as AnyValidator }
  }
  return value as ResponseDoc
}

/**
 * Unwrap the AdonisJS `params` convention: `filenameParamValidator` produces
 * `{ properties: { params: { properties: { filename } } } }`. Return the inner
 * per-param schemas. A flat validator (no `params` wrapper) is passed through.
 */
function unwrapParamsSchema(paramsValidator: AnyValidator): JsonObject {
  const schema = paramsValidator.toJSONSchema() as JsonObject
  const inner = schema.properties?.params ?? schema
  return (inner.properties ?? {}) as JsonObject
}

/**
 * Convert an AdonisJS route pattern to an OpenAPI path:
 *   `/api/zim/:filename`   → `/api/zim/{filename}`
 *   `/api/zim/:id?`        → `/api/zim/{id}`
 *   `/api/files/*`         → `/api/files/{wildcard}`
 */
function toOpenApiPath(pattern: string): string {
  return pattern
    .replace(/:([A-Za-z0-9_]+)\??/g, '{$1}')
    .replace(/\*/g, '{wildcard}')
}

/**
 * Derive a stable operationId, e.g. `get_api_zim_list`.
 */
function operationId(method: string, oaPath: string): string {
  const slug = oaPath
    .replace(/[{}]/g, '')
    .split('/')
    .filter(Boolean)
    .join('_')
  return slug ? `${method}_${slug}` : `${method}_root`
}

/**
 * Normalize a Vine JSON Schema for OpenAPI 3.1. Vine emits clean Draft-7
 * (no `$defs`/`$ref`), so we only need to strip the `$schema` keyword, which
 * is not allowed on OpenAPI schema objects. Done recursively for safety.
 */
function normalizeSchema(schema: JsonObject): JsonObject {
  if (Array.isArray(schema)) {
    return schema.map((item) => (isObject(item) ? normalizeSchema(item) : item))
  }
  if (!isObject(schema)) return schema

  const out: JsonObject = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema') continue
    out[key] = isObject(value) || Array.isArray(value) ? normalizeSchema(value) : value
  }
  return out
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null
}
