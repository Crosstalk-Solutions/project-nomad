import { test } from '@japa/runner'
import { selectRewriteModel } from '../../app/utils/rag_utils.js'
import { DEFAULT_QUERY_REWRITE_MODEL } from '../../constants/ollama.js'

test.group('selectRewriteModel', () => {
  test('returns preferred model when it is installed', ({ assert }) => {
    const models = [{ name: DEFAULT_QUERY_REWRITE_MODEL }, { name: 'llama3.2:8b' }]
    const result = selectRewriteModel(models, DEFAULT_QUERY_REWRITE_MODEL)
    assert.equal(result.model, DEFAULT_QUERY_REWRITE_MODEL)
    assert.isFalse(result.isFallback)
  })

  test('returns first available model when preferred is not installed', ({ assert }) => {
    const models = [{ name: 'llama3.2:8b' }, { name: 'mistral:7b' }]
    const result = selectRewriteModel(models, DEFAULT_QUERY_REWRITE_MODEL)
    assert.equal(result.model, 'llama3.2:8b')
    assert.isTrue(result.isFallback)
  })

  test('returns undefined when no models are installed', ({ assert }) => {
    const result = selectRewriteModel([], DEFAULT_QUERY_REWRITE_MODEL)
    assert.isUndefined(result.model)
    assert.isTrue(result.isFallback)
  })

  test('preferred model wins even when other models appear first in the list', ({ assert }) => {
    const models = [{ name: 'llama3.2:8b' }, { name: DEFAULT_QUERY_REWRITE_MODEL }]
    const result = selectRewriteModel(models, DEFAULT_QUERY_REWRITE_MODEL)
    assert.equal(result.model, DEFAULT_QUERY_REWRITE_MODEL)
    assert.isFalse(result.isFallback)
  })
})
