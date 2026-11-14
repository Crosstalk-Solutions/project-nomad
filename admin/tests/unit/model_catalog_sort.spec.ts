/**
 * The model catalog can come back with null pull counts and tag sizes. Sorting
 * used to call .endsWith() on them and throw, which emptied the recommended list.
 *
 * A Japa spec: OllamaService imports the Adonis logger at module scope. Run with
 * `node ace test unit`.
 */
import assert from 'node:assert/strict'
import { test } from '@japa/runner'
import { OllamaService } from '../../app/services/ollama_service.js'

function model(name: string, pulls: string | null, sizes: (string | null)[]) {
  return {
    id: name,
    name,
    description: '',
    estimated_pulls: pulls,
    model_last_updated: null,
    first_seen: '',
    tags: sizes.map((size, i) => ({
      name: `${name}:${i}`,
      size,
      context: '',
      input: 'Text',
      cloud: false,
      thinking: false,
    })),
  }
}

test.group('sortModels with missing catalog fields', () => {
  test('ranks models without a pull count last', () => {
    const service = new OllamaService() as any
    const sorted = service.sortModels(
      [model('a', null, ['1GB']), model('b', '2.5M', ['1GB']), model('c', '900K', ['1GB'])],
      'pulls'
    )
    assert.deepEqual(
      sorted.map((m: any) => m.name),
      ['b', 'c', 'a']
    )
  })

  test('ranks tags without a size last', () => {
    const service = new OllamaService() as any
    const [sorted] = service.sortModels([model('a', '1M', [null, '5GB', '600MB'])], 'name')
    assert.deepEqual(
      sorted.tags.map((t: any) => t.size),
      ['600MB', '5GB', null]
    )
  })
})
