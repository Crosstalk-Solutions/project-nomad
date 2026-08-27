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
import type { RetrievedChunk } from '../../types/rag.js'

/** Records every call so the tests can assert on what was *not* run. */
function makeFakes(opts: { nomadMd?: string | null; searchResults?: RetrievedChunk[] } = {}) {
  const calls = { hasDocuments: 0, search: 0, chat: 0 }
  const args = { minFinalScore: undefined as number | undefined }

  const ragService = {
    async hasDocuments() {
      calls.hasDocuments++
      return true
    },
    async searchSimilarDocuments(
      _query: string,
      _limit: number,
      _scoreThreshold: number,
      _collection: string | undefined,
      _stagesOut: unknown,
      minFinalScore: number,
      floorOut?: { candidates: number; belowFloor: number }
    ) {
      calls.search++
      args.minFinalScore = minFinalScore
      const results =
        opts.searchResults ?? [{ text: 'retrieved body', score: 0.9, metadata: { full_title: 'A Doc' } }]
      // Stand in for the real floor: whatever the fake was told to return is
      // what survived, and anything it was told to withhold is what did not.
      if (floorOut) {
        floorOut.candidates = 3
        floorOut.belowFloor = 3 - results.length
      }
      return results
    },
  }

  const ollamaService = {
    async chat() {
      calls.chat++
      return { message: { content: 'rewritten query' } }
    },
    async getModelInfo() {
      return { hasThinking: false, parameterSize: '8.0B' }
    },
    async getModels() {
      return []
    },
  }

  const nomadMdService = {
    async getSystemPrompt() {
      return opts.nomadMd ?? null
    },
  }

  // A fixed window keeps these tests about the toggle rather than about
  // hardware detection; the budget planner is covered by context_budget.spec.ts.
  const contextWindowService = {
    async windowFor() {
      return 8192
    },
  }

  const tokenCalibration = {
    async ratioFor() {
      return 1
    },
  }

  const service = new RagPipelineService(
    ollamaService as any,
    ragService as any,
    nomadMdService as any,
    contextWindowService as any,
    tokenCalibration as any
  )

  return { service, calls, args }
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

test.group('buildPrompt | relevance floor', () => {
  test('injects no context block when nothing clears the floor', async ({ assert }) => {
    // The point of the floor. Retrieval ran, found candidates, and declined them
    // all — so the model must be handed nothing rather than the best of a bad
    // set, which is what the rag_context prompt used to have to talk it out of.
    const { service, calls } = makeFakes({ searchResults: [] })

    const trace = await service.buildPrompt(userTurn, 'llama3.1:8b', { minFinalScore: 0.62 })

    assert.equal(calls.search, 1)
    assert.deepEqual(trace.retrieved, [])
    assert.deepEqual(trace.injected, [])
    assert.isFalse(systemContents(trace.messages).some((c) => c.includes('[Context 1')))
    // ...and the default system prompt is untouched: declining to retrieve is
    // not the same as turning the assistant off.
    assert.include(systemContents(trace.messages), SYSTEM_PROMPTS.default)
  })

  test('records the floor and the drop count on the trace', async ({ assert }) => {
    // "The knowledge base had no match at all" and "everything found was judged
    // irrelevant" are different things to tell a user, so the trace has to keep
    // them apart rather than both collapsing to an empty retrieved list.
    const { service } = makeFakes({ searchResults: [] })

    const trace = await service.buildPrompt(userTurn, 'llama3.1:8b', { minFinalScore: 0.62 })

    assert.equal(trace.minFinalScore, 0.62)
    assert.equal(trace.chunksBelowFloor, 3)
  })

  test('an explicit option overrides the rag.minRelevance setting', async ({ assert }) => {
    // What keeps the eval harness reproducible: it always passes a value, so a
    // slider set on one machine cannot move the numbers a baseline was recorded
    // against.
    const { service, args } = makeFakes()

    await service.buildPrompt(userTurn, 'llama3.1:8b', { minFinalScore: 0.9 })

    assert.equal(args.minFinalScore, 0.9)
  })
})
