import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateSettingValue } from '../../app/validators/settings.js'

test('ai.amdHsaOverride accepts a gfx version, none, or empty', () => {
  for (const value of ['11.0.0', '10.3.0', ' 11.0.0 ', 'none', 'NONE', '', null, undefined]) {
    assert.equal(validateSettingValue('ai.amdHsaOverride', value), null, String(value))
  }
})

test('ai.amdHsaOverride rejects anything that is not a version', () => {
  for (const value of ['11', '11.0', 'gfx1103', '11.0.0; rm -rf /', '11.0.0\nFOO=1', 11, true]) {
    assert.notEqual(validateSettingValue('ai.amdHsaOverride', value), null, String(value))
  }
})
