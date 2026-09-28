import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Regression test for #1359: "Medicine Comprehensive" and "Survival Preparedness
 * Comprehensive" fail to download with a 404.
 *
 * The 404 isn't a bundle-level problem — one dated ZIM filename inside each pack
 * is stale. Kiwix rotates these files on its own schedule (and sometimes renames
 * them outright) and deletes the old copy, so a hardcoded `url` in this catalog
 * silently rots. This test HEAD-checks the exact resources the issue reports as
 * failing and fails loudly, by id, the same way TeamWFO47 diagnosed it by hand
 * (`curl -sIL <url>`), instead of surfacing as a generic download-queue failure.
 */

const CATALOG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../collections/kiwix-categories.json'
)

interface CatalogResource {
  id: string
  url: string
}

interface CatalogSpec {
  categories: Array<{
    tiers: Array<{ resources: CatalogResource[] }>
  }>
}

function findResource(id: string): CatalogResource {
  const spec: CatalogSpec = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  for (const category of spec.categories) {
    for (const tier of category.tiers) {
      for (const resource of tier.resources) {
        if (resource.id === id) return resource
      }
    }
  }
  throw new Error(`resource "${id}" not found in ${CATALOG_PATH}`)
}

async function assertResourceUrlIsLive(id: string): Promise<void> {
  const resource = findResource(id)
  const response = await fetch(resource.url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  assert.ok(
    response.status === 200 || response.status === 206,
    `${id}: ${resource.url} returned HTTP ${response.status} — stale ZIM version (#1359)`
  )
}

// Medicine > Comprehensive
test(
  'librepathology_en_all_maxi (Medicine Comprehensive) URL is live, not a stale dated ZIM (#1359)',
  { timeout: 25_000 },
  () => assertResourceUrlIsLive('librepathology_en_all_maxi')
)

// Survival & Preparedness > Standard/Comprehensive (Comprehensive downloads the whole chain)
test(
  'canadian_prepper_winterprepping_en (Survival Preparedness Comprehensive) URL is live (#1359)',
  { timeout: 25_000 },
  () => assertResourceUrlIsLive('canadian_prepper_winterprepping_en')
)

test(
  'canadian_prepper_bugoutconcepts_en (Survival Preparedness Comprehensive) URL is live (#1359)',
  { timeout: 25_000 },
  () => assertResourceUrlIsLive('canadian_prepper_bugoutconcepts_en')
)

test(
  'urban-prepper_en_all (Survival Preparedness Comprehensive) URL is live (#1359)',
  { timeout: 25_000 },
  () => assertResourceUrlIsLive('urban-prepper_en_all')
)
