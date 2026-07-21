/**
 * Generates the curated drug-reference data modules
 * (`app/data/{conditions,natural_remedies,home_remedies}.ts`) from the
 * single-source JSON in the repo-root `collections/` directory.
 *
 *   npm run gen:curated-data      (from admin/)
 *
 * The JSON files are the ONLY thing a human edits. The generated `.ts` modules
 * keep the data compiled into the image (no runtime file read, no path
 * fragility), and `tests/standalone/curated_data_sync.standalone.ts` fails CI if
 * a generated module ever drifts from its JSON. This removes the old burden of
 * hand-keeping the `.json` mirror and the `.ts` constant in sync
 * (Crosstalk-Solutions/project-nomad#1040 follow-up).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url)) // admin/scripts
const collectionsDir = resolve(here, '../../collections')
const dataDir = resolve(here, '../app/data')

interface Spec {
  name: string
  exportName: string
  typeName: string
  provenance: string
}

const SPECS: Spec[] = [
  {
    name: 'conditions',
    exportName: 'CONDITIONS_FILE',
    typeName: 'ConditionsFile',
    provenance:
      'Curated "when to use what" condition spine (Phase 1). US-government / public-domain sourcing.',
  },
  {
    name: 'natural_remedies',
    exportName: 'NATURAL_REMEDIES_FILE',
    typeName: 'NaturalRemediesFile',
    provenance:
      'Hand-curated subset of NCCIH "Herbs at a Glance" (nccih.nih.gov), mapped to the condition spine. ' +
      'US-government / public domain; attribution lives in the file `source` field and the UI caveat.',
  },
  {
    name: 'home_remedies',
    exportName: 'HOME_REMEDIES_FILE',
    typeName: 'NaturalRemediesFile',
    provenance:
      'Non-herbal home-care / self-care measures from US-government public-domain pages ' +
      '(CDC, NIH/NLM MedlinePlus, FDA); each entry carries its own sourceUrl.',
  },
]

for (const spec of SPECS) {
  const json = JSON.parse(readFileSync(resolve(collectionsDir, `${spec.name}.json`), 'utf8'))

  const banner =
    `/* eslint-disable */\n` +
    `/**\n` +
    ` * GENERATED FILE — DO NOT EDIT.\n` +
    ` *\n` +
    ` * Single source of truth: collections/${spec.name}.json\n` +
    ` * Regenerate after editing the JSON: \`npm run gen:curated-data\` (from admin/).\n` +
    ` * curated_data_sync.standalone.ts fails CI if this file drifts from the JSON.\n` +
    ` *\n` +
    ` * ${spec.provenance}\n` +
    ` */\n`

  const module =
    `import type { ${spec.typeName} } from '../../types/conditions.js'\n\n` +
    `export const ${spec.exportName}: ${spec.typeName} = ${JSON.stringify(json, null, 2)}\n`

  writeFileSync(resolve(dataDir, `${spec.name}.ts`), banner + module)
  console.log(`generated app/data/${spec.name}.ts  ←  collections/${spec.name}.json`)
}

console.log('\nDone. Run `npm run format` is applied by the gen script; commit both the JSON and the generated .ts.')
