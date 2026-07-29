/*
|--------------------------------------------------------------------------
| OpenAPI route documentation helper
|--------------------------------------------------------------------------
|
| `documented()` wraps a route defined in `start/routes.ts` and records the
| schemas that describe it, so the OpenAPI generator can derive the spec from
| the same VineJS validators the controllers already validate against.
|
| The helper stores the descriptor against the live `Route` instance and
| returns the route unchanged, so it stays chainable (e.g. `.middleware(...)`)
| and the enclosing group's `.prefix()` still applies. The generator reads the
| final, prefixed pattern back off the same instance at build time.
|
*/
import type { Route } from '@adonisjs/core/http'
import type { VineValidator } from '@vinejs/vine'

/**
 * A compiled VineJS validator, as returned by `vine.compile(...)`. The schema
 * and metadata generics are irrelevant here — we only ever call `toJSONSchema()`.
 */
export type AnyValidator = VineValidator<any, any>

/**
 * Describes a single documented response. A bare validator is shorthand for
 * `{ schema: validator }` with a default description.
 */
export interface ResponseDoc {
  description?: string
  schema?: AnyValidator
}

export interface DocDescriptor {
  /** One-line summary shown as the operation title in Scalar. */
  summary?: string
  /** Longer prose description (Markdown supported by Scalar). */
  description?: string
  /** Tags used to group operations in the UI (usually the domain, e.g. `zim`). */
  tags?: string[]
  /** Validator for the JSON request body. */
  request?: AnyValidator
  /** Validator for the query string (each top-level property → a query param). */
  query?: AnyValidator
  /**
   * Validator for route params. Follows the AdonisJS convention of wrapping
   * fields under a top-level `params` object (e.g. `filenameParamValidator`);
   * the generator unwraps it. A flat object is also accepted.
   */
  params?: AnyValidator
  /** Response schemas keyed by HTTP status code. */
  responses?: Record<number | string, ResponseDoc | AnyValidator>
}

/**
 * Registry of documented routes. Keyed by the live `Route` instance so the
 * generator can read each route's final pattern/methods via `route.toJSON()`.
 */
const registry = new Map<Route, DocDescriptor>()

/**
 * Attach OpenAPI documentation to a route and return the route for chaining.
 */
export function documented(route: Route, descriptor: DocDescriptor): Route {
  registry.set(route, descriptor)
  return route
}

/**
 * The documented-route registry, consumed by the generator and the
 * completeness test.
 */
export function getDocRegistry(): ReadonlyMap<Route, DocDescriptor> {
  return registry
}
