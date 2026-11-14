import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { Validator } from 'jsonschema'
// The compat shim patches jsonschema's validator, so it must load before use.
import '../../app/utils/jsonschema_compat.js'

const schema = {
  $ref: '#/definitions/CommandMetaData',
  definitions: {
    CommandMetaData: { type: 'object' as const },
  },
}

test('a schema with a root $ref validates on Node 24.20+', () => {
  assert.doesNotThrow(() => new Validator().validate({}, schema, { throwError: true }))
})

test('the shim leaves validation intact', () => {
  assert.throws(() => new Validator().validate('not an object', schema, { throwError: true }))
})
