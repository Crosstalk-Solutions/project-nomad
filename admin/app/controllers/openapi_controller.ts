import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import type { HttpContext } from '@adonisjs/core/http'
import { buildOpenApiDocument } from '#start/openapi/generator'

const require = createRequire(import.meta.url)

/**
 * The self-contained Scalar browser bundle, read from the installed
 * `@scalar/api-reference` package and cached in memory. Served from this app
 * (not a CDN) so the API reference works on an offline appliance.
 */
let scalarBundle: string | null = null

function getScalarBundle(): string {
  if (scalarBundle === null) {
    const entry = require.resolve('@scalar/api-reference')
    const marker = '/node_modules/@scalar/api-reference/'
    const root = entry.slice(0, entry.lastIndexOf(marker) + marker.length - 1)
    scalarBundle = readFileSync(`${root}/dist/browser/standalone.js`, 'utf-8')
  }
  return scalarBundle
}

/**
 * The reference page mounts Scalar against our locally served bundle and spec.
 * Scalar auto-detects the `#api-reference` element and reads `data-url`.
 */
const REFERENCE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nomad Admin API Reference</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="/reference/assets/standalone.js"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/api/openapi.json',
        hideClientButton: true,
        telemetry: false,
        theme: 'saturn',
      })
    </script>
  </body>
</html>`

export default class OpenApiController {
  /**
   * The generated OpenAPI 3.1 document.
   */
  async spec({ response }: HttpContext) {
    return response.json(buildOpenApiDocument())
  }

  /**
   * The interactive Scalar API reference page.
   */
  async reference({ response }: HttpContext) {
    return response.header('content-type', 'text/html').send(REFERENCE_HTML)
  }

  /**
   * The locally bundled Scalar JS (kept off any CDN for offline use).
   */
  async standalone({ response }: HttpContext) {
    return response
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=86400')
      .send(getScalarBundle())
  }
}
