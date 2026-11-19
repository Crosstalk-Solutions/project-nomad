/**
 * jsonschema 1.5.0 resolves a root `$ref` with `new URL(ref, 'thismessage::/')`.
 * Node 24.20+ rejects a relative URL against that opaque base with `Invalid URL`,
 * so Ace cannot validate any command's metadata and every custom command
 * (`queue:work`, `list`, `eval:*`, ...) fails to load.
 *
 * Giving the schema an `$id` makes the same refs resolve against a normal URL.
 * Remove this once Adonis 7 brings in `@adonisjs/ace` >= 14.1.1.
 * Upstream: adonisjs/ace#169 (fixed by #170), tdegrunt/jsonschema#423.
 */
import { Validator } from 'jsonschema'
import type { Options, Schema, SchemaContext, ValidatorResult } from 'jsonschema'

const validate = Validator.prototype.validate

Validator.prototype.validate = function validateWithResolvableRefs(
  instance: any,
  schema: Schema,
  options?: Options,
  ctx?: SchemaContext
): ValidatorResult {
  if (schema && typeof schema === 'object' && !schema.$id && !schema.id) {
    schema.$id = 'http://localhost/schema.json'
  }
  return validate.call(this, instance, schema, options, ctx)
}
