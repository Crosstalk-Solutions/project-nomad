import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_MAC_NATIVE_WORKER_URL } from '../../app/services/mac_ai_service.js'

test('native mac ai worker default points at the macOS host from Docker', () => {
  assert.equal(DEFAULT_MAC_NATIVE_WORKER_URL, 'http://host.docker.internal:8765')
})
