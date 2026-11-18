import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateSettingValue } from '../../app/validators/settings.js'

// Validation for the `ui.serviceLogsUrl` override that backs the Settings sidebar's
// "Service Logs & Metrics" entry (see #1324). Dozzle is a management-compose
// container rather than a `services` row, so the per-app custom_url column has
// nothing to attach to and the link used to always resolve to
// http://<current-host>:9999 — unreachable behind a reverse proxy or local DNS.
//
// These cover the server side only. The href itself is built by getServiceLink /
// normalizeCustomUrl in inertia/lib/navigation.ts, which the Advanced page's client
// mirror below duplicates; that module reads window and is therefore not importable
// from a Node unit test (the app's tsconfig excludes inertia/ from the Node program).

const valid = (value: string) => assert.equal(validateSettingValue('ui.serviceLogsUrl', value), null)

// ── Accepted values ──────────────────────────────────────────────────────────

test('accepts http(s) URLs and bare hosts', () => {
  for (const value of [
    'https://logs.example.com',
    'http://logs.example.com',
    'https://example.com/logs',
    'https://example.com:8443/logs',
    'logs.lan',
    'logs.lan:9999',
    '10.0.0.5:9999',
  ]) {
    valid(value)
  }
})

test('ignores surrounding whitespace', () => {
  valid('  https://logs.example.com  ')
  valid('  logs.lan  ')
})

// ── Empty clears the override ─────────────────────────────────────────────────
// The Advanced page trims before submitting, so whitespace-only has to mean "clear"
// too — otherwise a field the user blanked by deleting the text would 422.

test('treats an empty or whitespace-only value as clearing the override', () => {
  for (const value of ['', '   ', '\t\n', undefined, null]) {
    assert.equal(validateSettingValue('ui.serviceLogsUrl', value), null)
  }
})

// ── Refused values ───────────────────────────────────────────────────────────

test('rejects a declared non-http(s) scheme', () => {
  // Refused at the input rather than silently reinterpreted as a hostname by the
  // http:// prefix normalizeCustomUrl applies to a scheme-less value.
  for (const value of [
    'file:///etc/passwd',
    'ftp://logs.example.com',
    'javascript://alert(1)',
    'gopher://logs.example.com',
  ]) {
    assert.match(
      String(validateSettingValue('ui.serviceLogsUrl', value)),
      /http or https/,
      `${value} should be refused`
    )
  }
})

test('rejects malformed URLs', () => {
  for (const value of ['not a url', 'http://', '://logs.example.com']) {
    assert.match(
      String(validateSettingValue('ui.serviceLogsUrl', value)),
      /valid URL/,
      `${value} should be refused`
    )
  }
})

test('rejects non-string values', () => {
  assert.match(String(validateSettingValue('ui.serviceLogsUrl', 42)), /must be a string/)
  assert.match(String(validateSettingValue('ui.serviceLogsUrl', true)), /must be a string/)
  assert.match(String(validateSettingValue('ui.serviceLogsUrl', ['https://a.example'])), /must be a string/)
})
