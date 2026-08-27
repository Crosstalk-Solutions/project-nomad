/**
 * JSON Schemas and a tolerant parser for the structured ancillary calls —
 * chat titles, suggestion chips, and the RAG query rewrite.
 *
 * The prompts used to *ask* for a format and the callers recovered the answer by
 * string surgery: split on comma, else on newline, strip `1.`, strip bullets,
 * strip quotes. That is a request, not a constraint, and the failure mode was
 * silent — an empty chip list, or a paragraph as the sidebar title.
 *
 * Ollama's `format` parameter compiles a JSON Schema to a GBNF grammar, so the
 * decoder cannot emit anything else. It only exists on the native /api/chat
 * transport, so every caller keeps its old parser as the fallback for other
 * backends; `parseStructured` returning null is what selects that path.
 *
 * Pure functions, no framework imports — see `think_stream.ts` / `rag_prompt.ts`.
 */

/** Sidebar chat title. */
export const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
  },
  required: ['title'],
  additionalProperties: false,
} as const

/** The three conversation-starter chips on an empty chat. */
export const SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const

/**
 * History-aware query rewrite. An array rather than a single string even though
 * only the first entry is used today: multi-query / RAG-Fusion (gap analysis 3.2)
 * then needs a prompt change and nothing else.
 */
export const QUERIES_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
  },
  required: ['queries'],
  additionalProperties: false,
} as const

/**
 * Pull a JSON object out of a model response and narrow it with `pick`.
 *
 * Total by construction — every failure returns null so the caller falls through
 * to its string parser. This runs on the chat critical path via the rewrite, so
 * it must never throw.
 *
 * Tolerates the things an unconstrained model does anyway: a ```json fence, a
 * sentence of preamble, trailing commentary. Grammar-constrained output needs
 * none of that, but the same helper is used on backends where the grammar was
 * never applied.
 */
export function parseStructured<T>(raw: string, pick: (value: any) => T | null): T | null {
  if (!raw) return null

  // Outermost braces: the first `{` to the last `}`. Preamble and trailing prose
  // both fall outside it, and a nested object stays inside.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  let parsed: any
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  try {
    return pick(parsed)
  } catch {
    return null
  }
}

/**
 * The two ways a structured call can fail to yield a value.
 *
 * `unconstrained` — no grammar reached the model (a non-native backend, or a call
 * that never asked for one). The response is prose by design and the caller's
 * legacy string parser is the correct recovery.
 *
 * `constrained-parse-failed` — the grammar *was* applied and the output still did
 * not yield a value. In practice that means a truncated object: the model hit its
 * token cap mid-JSON. Feeding that to a parser written for prose is what produces
 * `{"title": ...` in the sidebar or a JSON blob in the embedded query, so the
 * caller must take its safe path instead.
 */
export type StructuredResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'constrained-parse-failed' | 'unconstrained' }

/**
 * `parseStructured` plus the reason it failed, so callers branch on what actually
 * happened rather than sniffing the raw text for braces.
 *
 * `constrained` is `NomadChatResponse.structured` — whether the decoder was really
 * grammar-constrained for the request, which only the transport knows.
 *
 * Total, like `parseStructured`: a picker that throws is a failed parse, not an
 * exception on the chat critical path.
 */
export function resolveStructured<T>(
  raw: string,
  pick: (value: any) => T | null,
  constrained: boolean
): StructuredResult<T> {
  const value = parseStructured(raw, pick)
  if (value !== null) return { ok: true, value }
  return { ok: false, reason: constrained ? 'constrained-parse-failed' : 'unconstrained' }
}

/** Non-empty trimmed string, or null. */
function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Trimmed, non-empty entries of a string array. Null when nothing survives. */
function cleanStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const cleaned = value.map(cleanString).filter((s): s is string => s !== null)
  return cleaned.length > 0 ? cleaned : null
}

/** `{title: string}` -> the title. */
export const pickTitle = (value: any): string | null => cleanString(value?.title)

/** `{suggestions: string[]}` -> up to three non-empty suggestions. */
export const pickSuggestions = (value: any): string[] | null => {
  const suggestions = cleanStringArray(value?.suggestions)
  return suggestions ? suggestions.slice(0, 3) : null
}

/** `{queries: string[]}` -> every non-empty query, best first. */
export const pickQueries = (value: any): string[] | null => cleanStringArray(value?.queries)
