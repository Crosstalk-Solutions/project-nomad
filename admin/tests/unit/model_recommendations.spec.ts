import assert from 'node:assert/strict'
import test from 'node:test'
import { FALLBACK_RECOMMENDED_OLLAMA_MODELS } from '../../constants/ollama.js'
import type { NomadOllamaModel } from '../../types/ollama.js'
import {
  modelAcceptsImages,
  selectRecommendedModels,
} from '../../app/utils/model_recommendations.js'

function model(name: string, input: string): NomadOllamaModel {
  return {
    id: name,
    name,
    description: name,
    estimated_pulls: '1M',
    first_seen: '2026-01-01',
    model_last_updated: 'today',
    tags: [
      {
        name: `${name}:latest`,
        size: '2 GB',
        context: '32K',
        input,
        cloud: false,
        thinking: false,
      },
    ],
  }
}

test('recommended offline models always include an image-capable option when available', () => {
  const models = [
    model('popular-text-one', 'Text'),
    model('popular-text-two', 'Text'),
    model('popular-text-three', 'Text'),
    model('vision-model', 'Text, Image'),
  ]

  const recommended = selectRecommendedModels(models, 3)

  assert.deepEqual(
    recommended.map((entry) => entry.name),
    ['popular-text-one', 'popular-text-two', 'vision-model']
  )
  assert.equal(recommended[2].tags.length, 1)
})

test('recommended selection preserves popularity order when vision is already represented', () => {
  const models = [
    model('popular-text', 'Text'),
    model('popular-vision', 'Text, Image'),
    model('another-text', 'Text'),
    model('later-vision', 'Text, Image'),
  ]

  assert.deepEqual(
    selectRecommendedModels(models, 3).map((entry) => entry.name),
    ['popular-text', 'popular-vision', 'another-text']
  )
})

test('fallback recommendations include an image-capable model', () => {
  assert.equal(FALLBACK_RECOMMENDED_OLLAMA_MODELS.some(modelAcceptsImages), true)
})
