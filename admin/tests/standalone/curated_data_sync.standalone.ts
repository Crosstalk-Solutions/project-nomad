/**
 * Drift guard for the curated drug-reference data (upstream #1040 follow-up).
 *
 *   node --experimental-strip-types tests/standalone/curated_data_sync.standalone.ts
 *
 * The `collections/*.json` files are the single source of truth; the matching
 * `app/data/*.ts` modules are generated from them (`npm run gen:curated-data`).
 * This test fails if a generated module ever drifts from its JSON — i.e. if
 * someone hand-edited the `.ts` instead of the JSON, or forgot to regenerate.
 * A failure means: edit the JSON, then run `npm run gen:curated-data`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { CONDITIONS_FILE } from '../../app/data/conditions.ts'
import { NATURAL_REMEDIES_FILE } from '../../app/data/natural_remedies.ts'
import { HOME_REMEDIES_FILE } from '../../app/data/home_remedies.ts'

const collectionsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../collections')

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ok - ${name}`)
}

const CASES: Array<[string, unknown]> = [
  ['conditions', CONDITIONS_FILE],
  ['natural_remedies', NATURAL_REMEDIES_FILE],
  ['home_remedies', HOME_REMEDIES_FILE],
]

for (const [name, generated] of CASES) {
  check(`app/data/${name}.ts is in sync with collections/${name}.json`, () => {
    const json = JSON.parse(readFileSync(resolve(collectionsDir, `${name}.json`), 'utf8'))
    assert.deepEqual(
      generated,
      json,
      `app/data/${name}.ts drifted from collections/${name}.json — edit the JSON, then run \`npm run gen:curated-data\``
    )
  })
}

console.log(`\n${passed} passed`)
