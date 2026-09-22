import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  decideDrugRowReconcile,
  findDatasetCategorySlug,
  type DrugRowReconcileInput,
} from '../../app/utils/drug_install_row_reconcile.js'
import type { ZimCategoriesSpec } from '../../types/collections.js'

// The state a 1.34.0 box is left in: full ingest, failed row write.
const stuck: DrugRowReconcileInput = {
  rowCount: 261671,
  hasInstallRow: false,
  lastUpdatedExportDate: '2026-08-01',
  hasDownloadMarker: false,
  jobInFlight: false,
}

test('a completed ingest with no install row is backfilled at its export date', () => {
  assert.deepEqual(decideDrugRowReconcile(stuck), { action: 'backfill', version: '2026-08-01' })
})

test('an existing install row is left alone', () => {
  assert.equal(decideDrugRowReconcile({ ...stuck, hasInstallRow: true }).action, 'skip')
})

test('an empty drug_labels table is not backfilled', () => {
  assert.equal(decideDrugRowReconcile({ ...stuck, rowCount: 0 }).action, 'skip')
})

test('a partial ingest (no export date) is not backfilled', () => {
  assert.equal(decideDrugRowReconcile({ ...stuck, lastUpdatedExportDate: null }).action, 'skip')
  assert.equal(decideDrugRowReconcile({ ...stuck, lastUpdatedExportDate: '  ' }).action, 'skip')
})

test('a surviving download marker means the ingest has not finished', () => {
  assert.equal(decideDrugRowReconcile({ ...stuck, hasDownloadMarker: true }).action, 'skip')
})

test('an in-flight job is left to write its own row', () => {
  assert.equal(decideDrugRowReconcile({ ...stuck, jobInFlight: true }).action, 'skip')
})

const spec = {
  spec_version: '1',
  categories: [
    {
      name: 'Survival',
      slug: 'survival',
      icon: '',
      description: '',
      language: 'en',
      tiers: [{ name: 'Essential', slug: 'survival-essential', description: '', resources: [] }],
    },
    {
      name: 'Medicine',
      slug: 'medicine',
      icon: '',
      description: '',
      language: 'en',
      tiers: [
        { name: 'Essential', slug: 'medicine-essential', description: '', resources: [] },
        {
          name: 'Standard',
          slug: 'medicine-standard',
          description: '',
          includesTier: 'medicine-essential',
          resources: [
            {
              id: 'openfda-drug-labels',
              type: 'dataset',
              version: '2025-01',
              title: 'FDA Drug Reference',
              description: '',
              url: 'https://api.fda.gov/download.json',
              size_mb: 1700,
            },
          ],
        },
      ],
    },
  ],
} as unknown as ZimCategoriesSpec

test('the dataset resolves to the category whose tier lists it', () => {
  assert.equal(findDatasetCategorySlug(spec, 'openfda-drug-labels'), 'medicine')
})

test('an unknown dataset or missing spec yields null', () => {
  assert.equal(findDatasetCategorySlug(spec, 'nope'), null)
  assert.equal(findDatasetCategorySlug(null, 'openfda-drug-labels'), null)
})
