import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isDefaultTag,
  parseTagSizeBytes,
  requiredBytesForTag,
  selectRecommendedModels,
} from '../../app/utils/model_recommendation.js'
import { CPU_RAM_SHARE, inferenceMemoryBudget } from '../../app/utils/context_window.js'
import type { NomadOllamaModel } from '../../types/ollama.js'

const GIB = 2 ** 30

function tag(name: string, size: string) {
  return { name, size, context: '128k', input: 'Text', cloud: false, thinking: false }
}

function model(name: string, tags: ReturnType<typeof tag>[]): NomadOllamaModel {
  return {
    id: name,
    name,
    description: `${name} description`,
    estimated_pulls: '1M',
    model_last_updated: '',
    first_seen: '',
    tags,
  }
}

/**
 * A catalog shaped like the real one: ranked by pulls, each model listing its
 * default size tags alongside explicit quantization variants, sorted smallest
 * first the way OllamaService.sortModels leaves them.
 */
const CATALOG: NomadOllamaModel[] = [
  model('llama3.1', [
    tag('llama3.1:8b-text-q2_K', '3.2GB'),
    tag('llama3.1:8b', '4.9GB'),
    tag('llama3.1:latest', '4.9GB'),
    tag('llama3.1:8b-instruct-fp16', '16GB'),
    tag('llama3.1:70b', '43GB'),
  ]),
  model('qwen3', [
    tag('qwen3:0.6b', '523MB'),
    tag('qwen3:4b', '2.5GB'),
    tag('qwen3:8b', '5.2GB'),
    tag('qwen3:14b', '9.3GB'),
    tag('qwen3:30b', '19GB'),
    tag('qwen3:32b', '20GB'),
  ]),
  model('gpt-oss', [tag('gpt-oss:20b', '14GB'), tag('gpt-oss:120b', '65GB')]),
  model('gemma3', [
    tag('gemma3:1b', '815MB'),
    tag('gemma3:4b', '3.3GB'),
    tag('gemma3:12b', '8.1GB'),
    tag('gemma3:27b', '17GB'),
  ]),
]

const picks = (result: { models: NomadOllamaModel[] }) =>
  result.models.map((m) => m.tags.map((t) => t.name).join(','))

test('parseTagSizeBytes reads catalog sizes in decimal units', () => {
  assert.equal(parseTagSizeBytes('4.7GB'), 4.7e9)
  assert.equal(parseTagSizeBytes('5.1 GB'), 5.1e9)
  assert.equal(parseTagSizeBytes('622MB'), 622e6)
  assert.equal(parseTagSizeBytes('1.2TB'), 1.2e12)
  assert.equal(parseTagSizeBytes(''), undefined)
  assert.equal(parseTagSizeBytes('unknown'), undefined)
  assert.equal(parseTagSizeBytes(undefined), undefined)
  assert.equal(parseTagSizeBytes(null), undefined)
})

test('isDefaultTag accepts latest and bare sizes, rejects quantization variants', () => {
  for (const name of [
    'qwen3:latest',
    'qwen3:8b',
    'qwen3:0.6b',
    'gemma3n:e4b',
    'mixtral:8x7b',
    'llama3.1',
  ]) {
    assert.equal(isDefaultTag(name), true, name)
  }
  for (const name of [
    'llama3.1:8b-text-q4_1',
    'llama3.1:8b-instruct-fp16',
    'glm-4.7-flash:q8_0',
    'x:bf16',
  ]) {
    assert.equal(isDefaultTag(name), false, name)
  }
})

test('requiredBytesForTag reserves an 8k KV cache on top of the weights', () => {
  // 8B -> 128 KiB/token x 8192 tokens = 1 GiB of KV reserve.
  assert.equal(requiredBytesForTag(4.9e9, 'llama3.1:8b'), 4.9e9 + GIB)
})

test('8 GB VRAM: largest default tag under ~6.9 GB usable, too-large models skipped', () => {
  const result = selectRecommendedModels(CATALOG, 8 * GIB)
  // gpt-oss:20b (14 GB) cannot fit, so gemma3 takes its slot.
  assert.deepEqual(picks(result), ['llama3.1:8b', 'qwen3:8b', 'gemma3:4b'])
  assert.equal(result.noneFit, false)
})

test('16 GB VRAM: steps up to mid-size tags', () => {
  const result = selectRecommendedModels(CATALOG, 16 * GIB)
  assert.deepEqual(picks(result), ['llama3.1:8b', 'qwen3:14b', 'gemma3:12b'])
})

test('24 GB VRAM: fits gpt-oss:20b but not the 30B+ tags, and never picks the fp16 variant', () => {
  const result = selectRecommendedModels(CATALOG, 24 * GIB)
  assert.deepEqual(picks(result), ['llama3.1:8b', 'qwen3:14b', 'gpt-oss:20b'])
})

test('keeps catalog fields other than tags, and ranks by the input order', () => {
  const result = selectRecommendedModels(CATALOG, 16 * GIB)
  assert.equal(result.models[0].description, 'llama3.1 description')
  assert.deepEqual(
    result.models.map((m) => m.name),
    ['llama3.1', 'qwen3', 'gemma3']
  )
})

test('falls back to quantization variants when a model has no default tag that fits', () => {
  const catalog = [
    model('glm-4.7-flash', [
      tag('glm-4.7-flash:latest', '19GB'),
      tag('glm-4.7-flash:q4_K_M', '9GB'),
      tag('glm-4.7-flash:q8_0', '12GB'),
    ]),
  ]
  assert.deepEqual(picks(selectRecommendedModels(catalog, 16 * GIB)), ['glm-4.7-flash:q8_0'])
})

test('unknown tag sizes are not known to fit when another tag has a known size', () => {
  const catalog = [
    model('mystery', [tag('mystery:70b', ''), tag('mystery:8b', '4.9GB')]),
    model('toobig', [tag('toobig:70b', '43GB'), tag('toobig:405b', 'n/a')]),
  ]
  const result = selectRecommendedModels(catalog, 8 * GIB)
  assert.deepEqual(picks(result), ['mystery:8b'])
})

test('a model with no known tag sizes keeps its first tag, as before', () => {
  const catalog = [model('nosizes', [tag('nosizes:8b', ''), tag('nosizes:70b', '')])]
  assert.deepEqual(picks(selectRecommendedModels(catalog, 8 * GIB)), ['nosizes:8b'])
})

test('nothing fits: empty list with noneFit set', () => {
  const result = selectRecommendedModels(CATALOG, 0.5 * GIB)
  assert.deepEqual(result.models, [])
  assert.equal(result.noneFit, true)
})

test('an empty catalog is not reported as "nothing fits"', () => {
  assert.deepEqual(selectRecommendedModels([], 8 * GIB), { models: [], noneFit: false })
})

test('unknown budget keeps the old behaviour: top three at their first tag', () => {
  for (const budget of [undefined, 0, Number.NaN]) {
    const result = selectRecommendedModels(CATALOG, budget)
    assert.deepEqual(picks(result), ['llama3.1:8b-text-q2_K', 'qwen3:0.6b', 'gpt-oss:20b'])
    assert.equal(result.noneFit, false)
  }
})

test('inferenceMemoryBudget prefers reported VRAM, else a share of system RAM', () => {
  assert.equal(inferenceMemoryBudget(8192, 64 * GIB), 8 * GIB)
  assert.equal(inferenceMemoryBudget(0, 16 * GIB), 16 * GIB * CPU_RAM_SHARE)
  assert.equal(inferenceMemoryBudget(undefined, 16 * GIB), 8 * GIB)
  assert.equal(inferenceMemoryBudget(null, 16 * GIB), 8 * GIB)
})
