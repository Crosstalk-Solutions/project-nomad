/**
 * Loading and validating the golden question set, plus the corpus fingerprint.
 *
 * Pure and dependency-free so it runs under bare node in unit tests. Callers
 * supply file contents; nothing here touches the filesystem except through the
 * explicit `readFile`-shaped arguments the service passes in.
 */

/** A prior conversation turn, for multi-turn / coreference cases. */
export type GoldenTurn = { role: 'user' | 'assistant'; content: string }

export type Golden = {
  /** Stable identifier. Used as the join key across reports and baselines. */
  id: string
  /** The user's question, as they would actually type it. */
  query: string
  /** Conversation history preceding `query`. Empty for single-turn cases. */
  turns: GoldenTurn[]
  /**
   * Documents that genuinely answer the question, by corpus doc id (the
   * markdown filename without its extension). Empty for out-of-corpus cases.
   */
  relevantDocIds: string[]
  /**
   * Patterns the answer must contain. Each entry is a case-insensitive
   * **regular expression** — plain text is a valid regex, and alternation lets
   * one entry accept "3 minutes" or "three minutes" without inflating the list.
   */
  mustInclude: string[]
  /** Patterns the answer must NOT contain. Same regex semantics. */
  mustNotInclude: string[]
  /**
   * True when the corpus genuinely cannot answer the question and the correct
   * behaviour is to decline rather than invent. Scored as refusal-correctness.
   */
  expectRefusal: boolean
  /** Free-form buckets for per-slice reporting (single-hop, acronym, ...). */
  tags: string[]
}

export class GoldenSetError extends Error {}

/**
 * Parse a JSONL golden file, validating hard enough that a typo fails loudly at
 * load rather than silently scoring zero for the rest of the project's life.
 */
export function parseGoldens(jsonl: string, sourceName = 'goldens'): Golden[] {
  const goldens: Golden[] = []
  const seen = new Set<string>()

  jsonl.split('\n').forEach((rawLine, idx) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('//')) return

    const where = `${sourceName}:${idx + 1}`
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch (err) {
      throw new GoldenSetError(`${where}: not valid JSON — ${(err as Error).message}`)
    }

    const req = (field: string) => {
      if (parsed[field] === undefined) throw new GoldenSetError(`${where}: missing "${field}"`)
      return parsed[field]
    }

    const id = req('id')
    if (typeof id !== 'string' || !id) throw new GoldenSetError(`${where}: "id" must be a non-empty string`)
    if (seen.has(id)) throw new GoldenSetError(`${where}: duplicate id "${id}"`)
    seen.add(id)

    const query = req('query')
    if (typeof query !== 'string' || !query.trim()) {
      throw new GoldenSetError(`${where}: "query" must be a non-empty string`)
    }

    const strArray = (field: string): string[] => {
      const v = parsed[field] ?? []
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
        throw new GoldenSetError(`${where}: "${field}" must be an array of strings`)
      }
      return v
    }

    const mustInclude = strArray('mustInclude')
    const mustNotInclude = strArray('mustNotInclude')
    // Compile every pattern now. A bad regex that only blows up on the one run
    // where it finally matches is far worse than one that fails at load.
    for (const pattern of [...mustInclude, ...mustNotInclude]) {
      try {
        new RegExp(pattern, 'i')
      } catch (err) {
        throw new GoldenSetError(`${where}: invalid regex ${JSON.stringify(pattern)} — ${(err as Error).message}`)
      }
    }

    const turns = (parsed.turns ?? []) as GoldenTurn[]
    if (!Array.isArray(turns) || turns.some((t) => t?.role !== 'user' && t?.role !== 'assistant')) {
      throw new GoldenSetError(`${where}: "turns" must be an array of {role: user|assistant, content}`)
    }

    const expectRefusal = Boolean(parsed.expectRefusal)
    const relevantDocIds = strArray('relevantDocIds')
    if (expectRefusal && relevantDocIds.length > 0) {
      throw new GoldenSetError(
        `${where}: "${id}" expects a refusal but also lists relevant documents — one of those is wrong`
      )
    }
    if (!expectRefusal && relevantDocIds.length === 0) {
      throw new GoldenSetError(
        `${where}: "${id}" lists no relevant documents and does not expect a refusal — it can never be scored`
      )
    }

    goldens.push({
      id,
      query,
      turns,
      relevantDocIds,
      mustInclude,
      mustNotInclude,
      expectRefusal,
      tags: strArray('tags'),
    })
  })

  if (goldens.length === 0) throw new GoldenSetError(`${sourceName}: no goldens found`)
  return goldens
}

/**
 * Every doc id a golden refers to must exist in the corpus, or recall is being
 * computed against a target that can never be hit.
 */
export function assertGoldensMatchCorpus(goldens: Golden[], corpusDocIds: Iterable<string>): void {
  const corpus = new Set(corpusDocIds)
  const missing = new Set<string>()
  for (const g of goldens) {
    for (const docId of g.relevantDocIds) if (!corpus.has(docId)) missing.add(docId)
  }
  if (missing.size > 0) {
    throw new GoldenSetError(
      `goldens reference documents that are not in the corpus: ${[...missing].sort().join(', ')}`
    )
  }
}

/**
 * Inputs to the corpus fingerprint. Anything that changes what ends up in the
 * vector store belongs here — if it changes, prior reports are not comparable.
 */
export type FingerprintInputs = {
  /** docId -> raw file contents. */
  documents: Map<string, string>
  chunkTokens: number
  chunkOverlapTokens: number
  charToTokenRatio: number
  embeddingModel: string
  embeddingDimension: number
}

/**
 * A stable hash over the corpus and the ingest parameters that shaped it.
 *
 * Reports carry this. Comparing two reports with different fingerprints is
 * meaningless, and the compare command refuses to do it — which is the whole
 * point: it makes "I changed the chunk size and the score moved" impossible to
 * confuse with "I changed the prompt and the score moved".
 *
 * `hash` is injected so this stays pure and testable; the service passes a
 * node:crypto sha256.
 */
export function computeCorpusFingerprint(
  inputs: FingerprintInputs,
  hash: (input: string) => string
): string {
  const docIds = [...inputs.documents.keys()].sort()
  const parts: string[] = [
    `chunkTokens=${inputs.chunkTokens}`,
    `chunkOverlapTokens=${inputs.chunkOverlapTokens}`,
    `charToTokenRatio=${inputs.charToTokenRatio}`,
    `embeddingModel=${inputs.embeddingModel}`,
    `embeddingDimension=${inputs.embeddingDimension}`,
  ]
  for (const id of docIds) {
    parts.push(`doc=${id}\n${inputs.documents.get(id)}`)
  }
  return hash(parts.join('\n---\n')).slice(0, 16)
}
