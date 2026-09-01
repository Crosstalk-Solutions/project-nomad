import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  firstPublishedHostPort,
  mergeContainerConfigPreservingHostPorts,
  mergeUiLocationPreservingHostPort,
} from '../../app/utils/service_catalog_merge.js'

const config = (bindings: Record<string, string>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    Image: 'ghcr.io/example/app:1.0.0',
    ...extra,
    HostConfig: {
      PortBindings: Object.fromEntries(
        Object.entries(bindings).map(([containerPort, hostPort]) => [
          containerPort,
          [{ HostPort: hostPort }],
        ])
      ),
    },
  })

// ── container_config ────────────────────────────────────────────────────────

test('keeps the live host port when it diverges from the catalog default', () => {
  const merged = mergeContainerConfigPreservingHostPorts(
    config({ '8080/tcp': '8090' }),
    config({ '8080/tcp': '9999' })
  )
  assert.equal(firstPublishedHostPort(merged), '9999')
})

test('applies other catalog changes while keeping the port', () => {
  const merged = mergeContainerConfigPreservingHostPorts(
    config({ '8080/tcp': '8090' }, { Image: 'ghcr.io/example/app:2.0.0' }),
    config({ '8080/tcp': '9999' }, { Image: 'ghcr.io/example/app:1.0.0' })
  )
  assert.equal(JSON.parse(merged).Image, 'ghcr.io/example/app:2.0.0')
  assert.equal(firstPublishedHostPort(merged), '9999')
})

test('returns the catalog value untouched when the port already matches', () => {
  const catalog = config({ '8080/tcp': '8090' })
  assert.equal(mergeContainerConfigPreservingHostPorts(catalog, config({ '8080/tcp': '8090' })), catalog)
})

test('a catalog change to the CONTAINER-side port wins', () => {
  // The app now listens on 3000 inside the container. The live 8080 binding is a
  // different key, so there is nothing to preserve and the catalog is authoritative.
  const merged = mergeContainerConfigPreservingHostPorts(
    config({ '3000/tcp': '8090' }),
    config({ '8080/tcp': '9999' })
  )
  assert.equal(firstPublishedHostPort(merged), '8090')
})

test('preserves each port independently on a multi-port app', () => {
  const merged = mergeContainerConfigPreservingHostPorts(
    config({ '8080/tcp': '8310', '8081/tcp': '8311' }),
    config({ '8080/tcp': '9310', '8081/tcp': '8311' })
  )
  const bindings = JSON.parse(merged).HostConfig.PortBindings
  assert.equal(bindings['8080/tcp'][0].HostPort, '9310')
  assert.equal(bindings['8081/tcp'][0].HostPort, '8311')
})

// `services.container_config` is a MySQL json column, so the live value arrives as
// an already-parsed OBJECT, not a string, despite the model typing it `string | null`.
// A string-only implementation passes every other test in this file and silently
// no-ops against a real database. Verified live before adding these.
test('accepts an already-parsed live config object (MySQL json column)', () => {
  const merged = mergeContainerConfigPreservingHostPorts(
    config({ '80/tcp': '8410' }),
    JSON.parse(config({ '80/tcp': '9410' }))
  )
  assert.equal(firstPublishedHostPort(merged), '9410')
})

test('ui_location honours a parsed live config object too', () => {
  assert.equal(
    mergeUiLocationPreservingHostPort('8410', '9410', JSON.parse(config({ '80/tcp': '9410' }))),
    '9410'
  )
})

test('unparseable or portless live config falls back to the catalog', () => {
  const catalog = config({ '8080/tcp': '8090' })
  assert.equal(mergeContainerConfigPreservingHostPorts(catalog, 'not json'), catalog)
  assert.equal(mergeContainerConfigPreservingHostPorts(catalog, null), catalog)
  assert.equal(mergeContainerConfigPreservingHostPorts(catalog, JSON.stringify({})), catalog)
})

// ── ui_location ─────────────────────────────────────────────────────────────

test('rewrites a bare port to the live one', () => {
  assert.equal(
    mergeUiLocationPreservingHostPort('8090', '9999', config({ '8080/tcp': '9999' })),
    '9999'
  )
})

test('takes the catalog scheme and the live port', () => {
  // Vaultwarden moved to https in the catalog; this install runs on 9480.
  assert.equal(
    mergeUiLocationPreservingHostPort('https:8480', '9480', config({ '80/tcp': '9480' })),
    'https:9480'
  )
})

test('a path ui_location is never rewritten', () => {
  assert.equal(mergeUiLocationPreservingHostPort('/chat', '/chat', null), '/chat')
  assert.equal(mergeUiLocationPreservingHostPort('/chat', '9999', config({ '80/tcp': '9999' })), '/chat')
})

test('ignores a live port the install does not actually publish', () => {
  // Stale or hand-edited ui_location: pinning the link to it would point the
  // Open button at a port with nothing behind it.
  assert.equal(
    mergeUiLocationPreservingHostPort('8090', '7777', config({ '8080/tcp': '8090' })),
    '8090'
  )
})

test('null or missing values fall back to the catalog', () => {
  assert.equal(mergeUiLocationPreservingHostPort('8090', null, null), '8090')
  assert.equal(mergeUiLocationPreservingHostPort(null, '9999', null), null)
})
