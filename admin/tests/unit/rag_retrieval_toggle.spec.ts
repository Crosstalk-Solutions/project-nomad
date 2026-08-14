/**
 * The `rag.enabled` off-switch, at the level that actually matters: what
 * buildPrompt does and does not call.
 *
 * Turning retrieval off is a resource decision, so "no context injected" is
 * only half the contract — the point is that none of the three expensive steps
 * (hasDocuments, the query-rewrite LLM call, the Qdrant search) run at all.
 * These tests count calls, not just output.
 *
 * Japa suite (not the plain-node `test:unit` runner): RagPipelineService pulls
 * in the AdonisJS container, so it needs the ignited app that `node ace test`
 * provides. Run with:
 *   node ace test --suites=unit --files=rag_retrieval_toggle
 *
 * Deliberately NOT named rag_pipeline_*: that glob is what `npm run test:eval`
 * feeds to the plain-node runner, which cannot boot Adonis.
 */
import { test } from '@japa/runner'
import { RagPipelineService } from '#services/rag_pipeline_service'
import { SYSTEM_PROMPTS } from '../../constants/ollama.js'
import type { OllamaChatMessage } from '../../types/ollama.js'

/** Records every call so the tests can assert on what was *not* run. */
function makeFakes(opts: { nomadMd?: string | null } = {}) {
  const calls = { hasDocuments: 0, search: 0, chat: 0 }

  const ragService = {
    async hasDocuments() {
      calls.hasDocuments++
      return true
    },
    async searchSimilarDocuments() {
      calls.search++
      return [{ text: 'retrieved body', score: 0.9, metadata: { full_title: 'A Doc' } }]
    },
  }

  const ollamaService = {
    async chat() {
      calls.chat++
      return { message: { content: 'rewritten query' } }
    },
  }

  const nomadMdService = {
    async getSystemPrompt() {
      return opts.nomadMd ?? null
    },
  }

  const service = new RagPipelineService(
    ollamaService as any,
    ragService as any,
    nomadMdService as any
  )

  return { service, calls }
}

const userTurn: OllamaChatMessage[] = [{ role: 'user', content: 'how do I purify water?' }]

const systemContents = (messages: OllamaChatMessage[]) =>
  messages.filter((m) => m.role === 'system').map((m) => m.content)

test.group('buildPrompt | skipRetrieval', () => {
  test('skips every expensive step when retrieval is disabled', async ({ assert }) => {
    const { service, calls } = makeFakes()

    const trace = await service.buildPrompt(userTurn, 'llama3.1:8b', { skipRetrieval: true })

    // The whole point of the toggle: nothing reaches Qdrant or the LLM.
    assert.equal(calls.hasDocuments, 0)
    assert.equal(calls.search, 0)
    assert.equal(calls.chat, 0)

    // ...and no knowledge base context lands in the prompt.
    assert.deepEqual(trace.retrieved, [])
    assert.deepEqual(trace.injected, [])
    assert.isNull(trace.rewrittenQuery)
    assert.isFalse(trace.didRewrite)
    assert.isFalse(systemContents(trace.messages).some((c) => c.includes('[Context 1')))
  })

  test('still injects the default system prompt and NOMAD.md when disabled', async ({ assert }) => {
    // Neither of these is RAG; turning retrieval off must not silently strip
    // the user's persistent instructions or the formatting prompt.
    const { service } = makeFakes({ nomadMd: 'Always answer in metric units.' })

    const trace = await service.buildPrompt(userTurn, 'llama3.1:8b', { skipRetrieval: true })

    const systems = systemContents(trace.messages)
    assert.include(systems, SYSTEM_PROMPTS.default)
    assert.include(systems, 'Always answer in metric units.')
  })

  test('retrieves as normal when the option is omitted', async ({ assert }) => {
    // The eval harness never sets skipRetrieval. If this ever fails, every eval
    // run is silently scoring a no-retrieval pipeline.
    const { service, calls } = makeFakes()

    const trace = await service.buildPrompt(userTurn, 'llama3.1:8b', {})

    assert.equal(calls.hasDocuments, 1)
    assert.equal(calls.search, 1)
    assert.lengthOf(trace.retrieved, 1)
    assert.lengthOf(trace.injected, 1)
    assert.isTrue(systemContents(trace.messages).some((c) => c.includes('[Context 1')))
  })

  test('oracleContext still wins over skipRetrieval', async ({ assert }) => {
    // Both are bypasses; oracle mode supplies its own context and is checked
    // first, so an eval running in oracle mode is unaffected by the setting.
    const { service, calls } = makeFakes()
    const oracle = [{ text: 'oracle body', score: 1, metadata: {} }]

    const trace = await service.buildPrompt(userTurn, 'llama3.1:8b', {
      skipRetrieval: true,
      oracleContext: oracle,
    })

    assert.equal(calls.search, 0)
    assert.deepEqual(trace.retrieved, oracle)
    assert.lengthOf(trace.injected, 1)
  })
})
