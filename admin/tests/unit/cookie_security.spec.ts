import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { shouldUseSecureCookies } from '../../app/utils/cookie_security.js'

test('enables secure cookies for HTTPS public URLs', () => {
  assert.equal(shouldUseSecureCookies('https://nomad.example.com'), true)
  assert.equal(shouldUseSecureCookies('https://nomad.example.com:8443/admin'), true)
})

test('disables secure cookies for HTTP public URLs', () => {
  assert.equal(shouldUseSecureCookies('http://home'), false)
  assert.equal(shouldUseSecureCookies('http://localhost:8080'), false)
  assert.equal(shouldUseSecureCookies('http://192.168.1.10:8080'), false)
})

test('disables secure cookies when the public URL is invalid', () => {
  assert.equal(shouldUseSecureCookies('replaceme'), false)
  assert.equal(shouldUseSecureCookies(''), false)
})
