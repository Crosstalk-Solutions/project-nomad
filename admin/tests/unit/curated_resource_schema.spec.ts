import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import vine from '@vinejs/vine'

import { zimCategoriesSpecSchema } from '../../app/validators/curated_collections.js'

/**
 * VineJS STRIPS unknown keys rather than rejecting them, so a manifest field that
 * is not declared on the validator disappears silently on fetch. For `auth` that
 * failure is invisible and expensive: the gated download would go out with no
 * Authorization header and 401 for every user.
 *
 * These tests exist to catch that specific regression, so treat a failure here as
 * "the validator lost a field", not "the test is wrong".
 */

function specWithResource(resource: Record<string, unknown>) {
  return {
    spec_version: '1.0.0',
    categories: [
      {
        name: 'Survival & Preparedness',
        slug: 'survival-and-preparedness',
        icon: 'IconTent',
        description: 'Field references for austere conditions',
        language: 'en',
        tiers: [
          {
            name: 'Comprehensive',
            slug: 'comprehensive',
            description: 'Everything we have',
            resources: [resource],
          },
        ],
      },
    ],
  }
}

const baseResource = {
  id: 'field-manuals',
  version: '2026-07',
  title: 'US Military Field Manuals',
  description: 'Public-domain US military field manuals',
  url: 'https://nomad-packs-worker.chris-556.workers.dev/content/field-manuals_2026-07.zim',
  size_mb: 2000,
}

test('auth survives manifest validation', async () => {
  const validated: any = await vine.validate({
    schema: zimCategoriesSpecSchema,
    data: specWithResource({ ...baseResource, auth: 'nomad_app_key' }),
  })

  const resource = validated.categories[0].tiers[0].resources[0]
  assert.equal(
    resource.auth,
    'nomad_app_key',
    'auth was stripped by the validator — gated downloads would 401'
  )
})

test('a resource without auth validates and reports auth as undefined', async () => {
  const validated: any = await vine.validate({
    schema: zimCategoriesSpecSchema,
    data: specWithResource(baseResource),
  })

  assert.equal(validated.categories[0].tiers[0].resources[0].auth, undefined)
})

test('an unrecognised auth scheme is rejected rather than silently ignored', async () => {
  await assert.rejects(() =>
    vine.validate({
      schema: zimCategoriesSpecSchema,
      data: specWithResource({ ...baseResource, auth: 'something_else' }),
    })
  )
})

test('auth and type coexist on one resource', async () => {
  const validated: any = await vine.validate({
    schema: zimCategoriesSpecSchema,
    data: specWithResource({ ...baseResource, type: 'zim', auth: 'nomad_app_key' }),
  })

  const resource = validated.categories[0].tiers[0].resources[0]
  assert.equal(resource.type, 'zim')
  assert.equal(resource.auth, 'nomad_app_key')
})
