import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canCompleteSetupOffline,
  describeOfflineBlockers,
  isServiceInstallableOffline,
  offlineBlockers,
} from '../../inertia/lib/offline_setup.js'
import type { WizardSelections } from '../../inertia/lib/offline_setup.js'

const NOTHING_SELECTED: WizardSelections = {
  services: [],
  mapCollections: [],
  creatorPacks: [],
  categoryTierCount: 0,
  aiModels: [],
  wikipediaOptionId: null,
}

const selections = (overrides: Partial<WizardSelections>): WizardSelections => ({
  ...NOTHING_SELECTED,
  ...overrides,
})

test('an app whose image is loaded locally installs offline', () => {
  assert.equal(isServiceInstallableOffline('kiwix', ['kiwix', 'kolibri']), true)
  assert.equal(isServiceInstallableOffline('ollama', ['kiwix', 'kolibri']), false)
})

test('installing only locally-available apps is possible offline', () => {
  const picks = selections({ services: ['kiwix', 'kolibri'] })
  assert.deepEqual(offlineBlockers(picks, ['kiwix', 'kolibri', 'ollama']), [])
  assert.equal(canCompleteSetupOffline(picks, ['kiwix', 'kolibri', 'ollama']), true)
})

test('an app with no local image blocks an offline finish', () => {
  const picks = selections({ services: ['kiwix', 'ollama'] })
  assert.deepEqual(offlineBlockers(picks, ['kiwix']), ['services'])
  assert.equal(canCompleteSetupOffline(picks, ['kiwix']), false)
})

test('every remote-catalog selection blocks an offline finish', () => {
  assert.deepEqual(offlineBlockers(selections({ mapCollections: ['north-america'] }), []), ['maps'])
  assert.deepEqual(offlineBlockers(selections({ categoryTierCount: 1 }), []), ['content'])
  assert.deepEqual(offlineBlockers(selections({ creatorPacks: ['pack-a'] }), []), ['creator-packs'])
  assert.deepEqual(offlineBlockers(selections({ aiModels: ['llama3'] }), []), ['ai-models'])
  assert.deepEqual(offlineBlockers(selections({ wikipediaOptionId: 'full' }), []), ['wikipedia'])
})

test("Wikipedia 'none' is a local deletion, not a download", () => {
  assert.deepEqual(offlineBlockers(selections({ wikipediaOptionId: 'none' }), []), [])
  assert.equal(canCompleteSetupOffline(selections({ wikipediaOptionId: 'none' }), []), true)
})

test('an empty wizard is trivially completable offline', () => {
  assert.equal(canCompleteSetupOffline(NOTHING_SELECTED, []), true)
})

test('blockers are reported in a stable order', () => {
  const picks = selections({
    services: ['ollama'],
    mapCollections: ['north-america'],
    categoryTierCount: 2,
    creatorPacks: ['pack-a'],
    aiModels: ['llama3'],
    wikipediaOptionId: 'full',
  })
  assert.deepEqual(offlineBlockers(picks, []), [
    'services',
    'maps',
    'content',
    'creator-packs',
    'ai-models',
    'wikipedia',
  ])
})

test('blocker descriptions read as a sentence fragment', () => {
  assert.equal(describeOfflineBlockers([]), '')
  assert.equal(describeOfflineBlockers(['maps']), 'map regions')
  assert.equal(describeOfflineBlockers(['maps', 'ai-models']), 'map regions and AI models')
  assert.equal(
    describeOfflineBlockers(['maps', 'content', 'ai-models']),
    'map regions, content categories and AI models'
  )
})
