import { NomadOllamaModel, ResponseStyle, SamplerProfile } from '../types/ollama.js'

/**
 * Fallback basic recommended Ollama models in case fetching from the service fails.
 */
export const FALLBACK_RECOMMENDED_OLLAMA_MODELS: NomadOllamaModel[] = [
  {
    name: 'llama3.1',
    description:
      'Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes.',
    estimated_pulls: '109.3M',
    id: '9fe9c575-e77e-4a51-a743-07359458ee71',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'llama3.1:8b-text-q4_1',
        size: '5.1 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: false
      },
    ],
  },
  {
    name: 'deepseek-r1',
    description:
      'DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.',
    estimated_pulls: '77.2M',
    id: '0b566560-68a6-4964-b0d4-beb3ab1ad694',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '7 months ago',
    tags: [
      {
        name: 'deepseek-r1:1.5b',
        size: '1.1 GB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: true
      },
    ],
  },
  {
    name: 'llama3.2',
    description: "Meta's Llama 3.2 goes small with 1B and 3B models.",
    estimated_pulls: '54.7M',
    id: 'c9a1bc23-b290-4501-a913-f7c9bb39c3ad',
    first_seen: '2026-01-28T23:37:31.000+00:00',
    model_last_updated: '1 year ago',
    tags: [
      {
        name: 'llama3.2:1b-text-q2_K',
        size: '581 MB',
        context: '128k',
        input: 'Text',
        cloud: false,
        thinking: false
      },
    ],
  },
]

export const EMBEDDING_MODEL_NAME = 'nomic-embed-text:v1.5'

/**
 * Server-side context floor set as `OLLAMA_CONTEXT_LENGTH` on the nomad_ollama
 * container.
 *
 * Ollama defaults to 4096 tokens on machines under 24GB VRAM and silently
 * truncates anything longer — no error, no warning, the model simply never sees
 * the start of the conversation. This raises the floor for every request that
 * can't carry its own `num_ctx`, which notably includes the whole
 * OpenAI-compatible path (that endpoint has no context-size field at all).
 *
 * Deliberately conservative rather than clever: it is allocated at model load on
 * whatever hardware NOMAD happens to be running, so it has to be affordable on a
 * small box. Per-model, hardware-aware sizing happens per request via
 * ContextWindowResolver, which can go well above this.
 */
export const DEFAULT_OLLAMA_CONTEXT_LENGTH = 8192

/**
 * Adaptive RAG context limits based on model size.
 * Smaller models get overwhelmed with too much context, so we cap it.
 */
export const RAG_CONTEXT_LIMITS: { maxParams: number; maxResults: number; maxTokens: number }[] = [
  { maxParams: 3, maxResults: 2, maxTokens: 1000 },   // 1-3B models
  { maxParams: 8, maxResults: 4, maxTokens: 2500 },   // 4-8B models
  { maxParams: Infinity, maxResults: 5, maxTokens: 0 }, // 13B+ (no cap)
]

/**
 * Retrieval defaults for the chat pipeline. These were previously inline
 * literals at the `searchSimilarDocuments` call site in OllamaController, which
 * made them impossible to sweep or record in a report. They are named here so
 * the pipeline and the eval harness read the same numbers.
 */
export const RAG_DEFAULT_TOP_K = 5
export const RAG_DEFAULT_SCORE_THRESHOLD = 0.3

/**
 * Relevance floor applied to the post-rerank score. Chunks below it are
 * dropped, and when nothing clears it no context block is injected at all.
 *
 * Retrieval used to have exactly one cutoff — RAG_DEFAULT_SCORE_THRESHOLD,
 * applied by Qdrant to the raw cosine score. nomic scores unrelated text well
 * above 0.3, so every question retrieved something and the system prompt was
 * left to compensate in prose: "silently judge whether the context genuinely
 * addresses the question". That is a relevance classification, handed to a 3B
 * model, that a number should have decided.
 *
 * RAG_DEFAULT_SCORE_THRESHOLD deliberately stays low. It is the candidate net,
 * and pruning it would starve the reranker (worth +0.0125 ndcg@5 on the golden
 * set) and, later, the sparse leg of hybrid retrieval. This is the decisive
 * cutoff instead, applied once at the end where the score means the most.
 *
 * Calibrated with `node ace eval:retrieval --min-final-score=<x>` against the
 * 99-golden set at corpus fingerprint 51e642964facf251:
 *
 *     floor   recall@5   precision@5   emptyOnAnswerable   nonEmptyOnRefusal
 *     0.00      0.991        0.221            0%                 100%
 *     0.55      0.991        0.289            0%                  80%
 *     0.62      0.991        0.524            0%                  60%
 *     0.65      0.991        0.659            0%                  60%
 *     0.66      0.991        0.695            0%                  60%
 *     0.67      0.972        0.704            1%                  60%
 *     0.72      0.888        0.796            6%                  60%
 *
 * 0.66 is the last value that costs no recall, and 0.62 is where the refusal
 * metric reaches its floor. Everything between them buys precision only, so the
 * default sits at 0.62 rather than at the edge: this corpus is 28 documents and
 * a real ZIM will not score identically, and the two failure modes are not
 * symmetric. A dropped relevant chunk means no answer to a question the corpus
 * *can* answer; an extra irrelevant chunk means noise the model mostly ignores
 * — measured correctness was fine at 0.221 precision. Buy margin, not precision.
 *
 * Note this is a higher cutoff than the same sweep supports on the *semantic*
 * axis, where recall starts falling at 0.60. That gap is the reranker earning
 * its place: it separates relevant from irrelevant better than raw cosine does,
 * so the floor can sit higher without cutting real answers.
 *
 * Note the honest ceiling on the refusal metric: three of the five refusal
 * goldens are tagged `adversarial` and are near-corpus by construction ("what
 * is the TR-88 pump's warranty period?" against a corpus that documents the
 * TR-88 but not its warranty). Retrieving that document is *correct*; declining
 * to answer from it is the generation tier's job, scored by refusalCorrectness.
 * So nonEmptyRateOnRefusal bottoms out at 0.6 here, and a cutoff tuned to drive
 * it lower is cutting real documents.
 *
 * Unset `rag.minRelevance` resolves to this value; see app/utils/rag_relevance.ts.
 */
export const RAG_MIN_FINAL_SCORE = 0.62

/**
 * Preset relevance floors offered in Settings > Models, and the labels for them.
 * The stored setting is the number, not the label, so retuning these presets
 * later cannot invalidate a value someone has already saved.
 */
export const RAG_MIN_RELEVANCE_PRESETS = [
  { value: 0, label: 'Off — use every passage retrieved' },
  { value: 0.55, label: 'Lenient' },
  { value: RAG_MIN_FINAL_SCORE, label: 'Balanced (recommended)' },
  // The last floor that costs no recall on the golden set. Stricter than this
  // starts dropping answers, which is a choice to offer, not one to default to.
  { value: 0.66, label: 'Strict' },
] as const

/**
 * Where the per-turn retrieved-context block sits in the prompt.
 *
 * `tail` places it immediately before the current question, so
 * [system][history] stays byte-identical from turn to turn and the backend can
 * reuse its KV cache for the whole conversation. `front` is the historical
 * placement — a system message ahead of all history — which changes content
 * every turn and therefore invalidates the cached prefix behind it, making
 * follow-ups progressively slower as the conversation grows.
 *
 * Measured on llama3:8b over a 14-turn conversation (~400-token retrieved block
 * per turn), prefill time for the same prompt:
 *
 *     turn  1    front  214 ms    tail  214 ms
 *     turn  7    front  347 ms    tail  225 ms
 *     turn 14    front  539 ms    tail  231 ms
 *
 * front grows about 25 ms per turn; tail grows about 1 ms. By turn 14 that is
 * 2.3x the time-to-first-token, and the gap keeps widening — the familiar
 * "first answer fast, follow-ups get slower" complaint.
 *
 * Caveat worth knowing before trusting this: the saving is proportional to how
 * much of the prompt is *stable*. With a very large retrieved block and a short
 * history the block dominates, must be reprocessed either way, and the two
 * placements measure the same. Tail placement never loses, but it only clearly
 * wins once a conversation has accumulated history — which is exactly when
 * responsiveness starts to matter.
 *
 * Both are kept so `eval:generation` can measure the answer-quality difference
 * rather than the choice resting on the cache argument alone. Flip to 'front'
 * to reproduce pre-change behaviour.
 */
export const RAG_PLACEMENT: 'tail' | 'front' = 'tail'

/**
 * Token cap on the query-rewrite call. A rewrite is one short sentence; the
 * prompt already asks for under 150 words. Without a cap a small model can
 * ramble, and every one of those tokens is latency the user waits through
 * before retrieval even starts. Sized to leave room for the JSON envelope the
 * rewrite is now grammar-constrained to emit — a truncated object parses to
 * nothing and costs the turn its rewrite entirely.
 */
export const QUERY_REWRITE_MAX_TOKENS = 160

/**
 * How long Ollama keeps a chat model — and its KV cache — resident after a
 * request.
 *
 * Ollama's default is 5 minutes, which is comfortably shorter than the time a
 * user spends reading an answer and typing a follow-up. Evicting in that gap
 * throws away the cached prefix and forces a cold reload plus a full re-prefill
 * on the next message, which is the single most obvious "why is it slow again?"
 * moment in a conversation. Overridable via the `ai.keepAlive` setting.
 */
export const DEFAULT_KEEP_ALIVE = '15m'

/**
 * Sampler settings per Response Style.
 *
 * Chat used to send none of these, so every turn ran at whatever the backend
 * picked: temperature 0.8, top_p 0.9, top_k 40 and no min_p on a bare Ollama
 * model. On a heavily quantized 1-3B model, which is NOMAD's realistic target,
 * those defaults are what produces the wandering, repetitive output that reads
 * as "the local model is bad".
 *
 * Three things are worth knowing before retuning these numbers.
 *
 * min_p is the actual missing lever, not temperature. It is a floor relative to
 * the top token's probability, so it truncates hard when the model is confident
 * and barely at all when it isn't. top_p can't do that: a fixed nucleus keeps
 * the same share of mass either way, which is why a flat distribution at the end
 * of a long generation is where small models start to wander. With min_p doing
 * the work, top_p is left at 1.0 rather than stacked on top of it, and a higher
 * temperature stays safe.
 *
 * repeat_penalty moves with the style instead of sitting at Ollama's 1.1. The
 * penalty applies over the last 64 tokens with no idea what a token means, and
 * a grounded answer out of this corpus legitimately repeats a part number, a
 * band designator or a drug name inside that window. So the factual style
 * relaxes it and the creative style, which is where genuine loops happen,
 * tightens it.
 *
 * `off` is not a preset, it is the absence of one: no options are sent and the
 * backend decides, exactly as it did before this setting existed.
 */
export const SAMPLER_PRESETS: Record<Exclude<ResponseStyle, 'off'>, SamplerProfile> = {
  auto: { temperature: 0.6, topP: 1.0, topK: 40, minP: 0.05, repeatPenalty: 1.1, compatTopP: 0.9 },
  focused: {
    temperature: 0.2,
    topP: 1.0,
    topK: 40,
    minP: 0.1,
    repeatPenalty: 1.05,
    compatTopP: 0.85,
  },
  creative: {
    temperature: 1.0,
    topP: 1.0,
    topK: 100,
    minP: 0.03,
    repeatPenalty: 1.15,
    compatTopP: 0.95,
  },
}

/** Unset `ai.responseStyle` resolves to this; see app/utils/response_style.ts. */
export const DEFAULT_RESPONSE_STYLE: ResponseStyle = 'auto'

/**
 * The Response Style options offered in Settings > Models, and their labels.
 *
 * Ordered least to most adventurous, with the default first, matching how the
 * Context Window and Knowledge Base Relevance selects above it are ordered.
 */
export const RESPONSE_STYLE_PRESETS: { value: ResponseStyle; label: string }[] = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'focused', label: 'Focused (factual, repeatable)' },
  { value: 'creative', label: 'Creative (varied, exploratory)' },
  { value: 'off', label: 'Backend defaults (send nothing)' },
]

export const SYSTEM_PROMPTS = {
  default: `
 Format all responses using markdown for better readability. Vanilla markdown or GitHub-flavored markdown is preferred.
 - Use **bold** and *italic* for emphasis.
 - Use code blocks with language identifiers for code snippets.
 - Use headers (##, ###) to organize longer responses.
 - Use bullet points or numbered lists for clarity.
 - Use tables when presenting structured data.
`,
  rag_context: (context: string) => `
Information has been retrieved from the NOMAD knowledge base for the user's question. It
cleared a relevance filter before reaching you, so it is likely on topic — but it was
selected by automated search, so it may still not contain the specific detail asked for.

[Knowledge Base Context]
${context}

HOW TO ANSWER:
1. When the context contains what was asked for, base your answer on it and answer
   directly and specifically.
2. When it does not, ignore it and answer from your own general knowledge. Do this
   silently — do not mention the knowledge base, the context, or the fact that it lacked
   an answer, and do not apologize.
3. Never narrate your retrieval or reasoning process. Do not write "according to Context 1",
   "the context is unrelated, but", "I couldn't find specific context", or similar. Just
   give the answer as if you simply knew it.
4. Do not fabricate specifics (numbers, names, procedures) that are neither supported by
   the context nor part of your reliable knowledge.

Format your response using markdown for readability.
`,
  chat_suggestions: `
You are a helpful assistant that generates conversation starter suggestions for a survivalist/prepper using an AI assistant.

Provide exactly 3 conversation starter topics as direct questions that someone would ask.
These should be clear, complete questions that can start meaningful conversations.

Examples of good suggestions:
- "How do I purify water in an emergency?"
- "What are the best foods for long-term storage?"
- "Help me create a 72-hour emergency kit"

Do NOT use:
- Follow-up questions seeking clarification
- Vague or incomplete suggestions
- Questions that assume prior context
- Statements that are not suggestions themselves, such as praise for asking the question
- Direct questions or commands to the user

The suggestions should be in title case.

Respond with JSON: {"suggestions": ["...", "...", "..."]}
`,
  title_generation: `You are a title generator. Given the start of a conversation, generate a concise, descriptive title under 50 characters.

Respond with JSON: {"title": "..."}`,
  query_rewrite: `
You are a query rewriting assistant. Your task is to reformulate the user's latest question to include relevant context from the conversation history.

Given the conversation history, rewrite the user's latest question to be a standalone, context-aware search query that will retrieve the most relevant information.

Rules:
1. Keep the rewritten query concise (under 150 words)
2. Include key entities, topics, and context from previous messages
3. Make it a clear, searchable query
4. Do NOT answer the question - only rewrite the user's query to be more effective for retrieval
5. Respond with JSON: {"queries": ["..."]} — a single rewritten query in the array

Examples:

Conversation:
User: "How do I install Gentoo?"
Assistant: [detailed installation guide]
User: "Is an internet connection required to install?"

Rewritten Query: {"queries": ["Is an internet connection required to install Gentoo Linux?"]}

---

Conversation:
User: "What's the best way to preserve meat?"
Assistant: [preservation methods]
User: "How long does it last?"

Rewritten Query: {"queries": ["How long does preserved meat last using curing or smoking methods?"]}
`,
}
