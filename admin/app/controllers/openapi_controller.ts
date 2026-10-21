import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import type { HttpContext } from '@adonisjs/core/http'
import { buildOpenApiDocument } from '#start/openapi/generator'

const require = createRequire(import.meta.url)

/**
 * O pacote independente do navegador Scalar, carregado do pacote
 * `@scalar/api-reference` instalado e armazenado em cache na memória.
 * É servido pela própria aplicação (e não por uma CDN), para que a
 * referência da API funcione em um dispositivo sem conexão com a internet.
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
 * A página de referência inicializa o Scalar usando o pacote JavaScript
 * servido localmente e a especificação da API.
 * O Scalar detecta automaticamente o elemento `#api-reference`
 * e lê o atributo `data-url`.
 */
const REFERENCE_HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Referência da API de Administração do Nomad</title>
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
   * O documento OpenAPI 3.1 gerado.
   */
  async spec({ response }: HttpContext) {
    return response.json(buildOpenApiDocument())
  }

  /**
   * A página interativa de referência da API do Scalar.
   */
  async reference({ response }: HttpContext) {
    return response.header('content-type', 'text/html').send(REFERENCE_HTML)
  }

  /**
   * O JavaScript do Scalar disponibilizado localmente
   * (sem utilizar uma CDN, para permitir o uso offline).
   */
  async standalone({ response }: HttpContext) {
    return response
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=86400')
      .send(getScalarBundle())
  }
}
