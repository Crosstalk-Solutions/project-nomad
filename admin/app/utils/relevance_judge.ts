/**
 * The pure half of the retrieval relevance check (#1341): the grammar, the
 * setting, and what the judge gets to read.
 *
 * Why a model and not another threshold: on a library holding general prose
 * (Gutenberg, Wikipedia), the nearest chunk to *any* question scores as high as
 * a genuinely relevant one. Measured on the eval corpus with its distractors,
 * the weakest correct top hit scored 0.666 post-rerank while "write me a haiku
 * about autumn leaves" pulled Walden at 0.705. No cutoff on that axis separates
 * the two, so the decision has to be a judgement about the question.
 *
 * Why one verdict for the whole set rather than one per passage: asked
 * passage-by-passage, every model tried (0.5B to 8B) rejected passages that
 * were on-topic but did not spell the answer out, and cost 9-17 points of
 * recall@5. "Are these about what was asked?" is the easier question, and on an
 * 8B model it took off-topic leaks from 67% to 6% for ~5 points of recall. On a
 * 3B model it rejects most real questions, which is why the check is opt-in.
 *
 * Pure so it unit-tests under bare node; RelevanceJudgeService owns the call.
 */

/**
 * Longest excerpt of each passage the judge reads. At 700 characters the window
 * routinely stopped a sentence short of the answer (wound packing, counterpoise
 * length) and the judge rightly said the passage didn't cover it.
 */
export const JUDGE_EXCERPT_CHARS = 1500

/** Anything shorter carries no topical signal; don't let it steer the excerpt. */
const MIN_TERM_LENGTH = 4

export type JudgeablePassage = { text: string; title?: string }

export const ON_TOPIC_SCHEMA = {
  type: 'object',
  properties: { on_topic: { type: 'boolean' } },
  required: ['on_topic'],
  additionalProperties: false,
} as const

export function pickOnTopic(value: any): boolean | null {
  return typeof value?.on_topic === 'boolean' ? value.on_topic : null
}

/**
 * Interpret the stored `rag.relevanceCheck` setting. Off unless explicitly on:
 * the check costs a model call per turn and hurts recall on small models, so
 * nothing short of a deliberate choice should turn it on.
 */
export function isRelevanceCheckEnabled(raw: unknown): boolean {
  return raw === true || raw === 'true'
}

/**
 * The stretch of `text` most about the question, at most `maxChars` long.
 *
 * Chunks run ~3000 characters and the judge sees half of each, so which half
 * matters. Picks the window holding the most occurrences of the question's
 * longer terms, falling back to the start when none appear.
 */
export function excerptFor(text: string, question: string, maxChars = JUDGE_EXCERPT_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean

  const terms = [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= MIN_TERM_LENGTH)
    ),
  ]
  const lower = clean.toLowerCase()
  const hits: number[] = []
  for (const term of terms) {
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) {
      hits.push(at)
    }
  }
  if (hits.length === 0) return clean.slice(0, maxChars) + '…'
  hits.sort((a, b) => a - b)

  // Densest window: two pointers over the sorted hit positions.
  let bestStart = hits[0]
  let bestCount = 0
  for (let lo = 0, hi = 0; hi < hits.length; hi++) {
    while (hits[hi] - hits[lo] > maxChars) lo++
    if (hi - lo + 1 > bestCount) {
      bestCount = hi - lo + 1
      bestStart = hits[lo]
    }
  }

  // Open a little before the first hit so the sentence it sits in reads whole.
  const start = Math.max(0, Math.min(bestStart - Math.floor(maxChars / 5), clean.length - maxChars))
  const end = start + maxChars
  return (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '')
}

/** The user turn of the judge call: the question, then each passage. */
export function buildJudgeInput(question: string, passages: JudgeablePassage[]): string {
  const blocks = passages.map((p, i) => {
    const heading = p.title ? `p${i + 1} (from "${p.title}")` : `p${i + 1}`
    return `${heading}:\n${excerptFor(p.text, question)}`
  })
  return `Question: ${question.trim()}\n\n${blocks.join('\n\n')}`
}
