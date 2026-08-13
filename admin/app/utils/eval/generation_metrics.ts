/**
 * Deterministic scorers for generated answers.
 *
 * Every metric here is computable offline with no judge model, which is what
 * makes the generation tier gateable. An LLM judge can be layered on later for
 * the things regex genuinely cannot see (nuanced faithfulness, completeness),
 * but nothing in this file needs one — and a number you can compute without a
 * model is a number that cannot drift because the judge changed.
 *
 * These are intentionally *conservative*. Each one is a proxy, and each proxy's
 * blind spot is documented where it lives. A proxy you understand the limits of
 * beats a score you cannot explain.
 */

/** Answer-level scoring of one generated response against one golden. */
export type GenerationScores = {
  /** Every mustInclude pattern matched and no mustNotInclude pattern did. */
  correct: boolean
  matchedRequired: string[]
  missedRequired: string[]
  /** Forbidden patterns that appeared. Non-empty means a specific wrong claim. */
  hitForbidden: string[]
  /** The model declined to answer. */
  refused: boolean
  /**
   * Refusal behaviour was right: declined an out-of-corpus question, or
   * answered an answerable one.
   */
  refusalCorrect: boolean
  /** The answer narrated its own retrieval ("according to Context 1"). */
  leakage: string[]
  /** Reasoning tags survived into the user-visible answer. */
  thinkTagLeak: boolean
  /**
   * Fraction of the answer's numeric claims that also appear in the injected
   * context. null when the answer makes no numeric claims.
   */
  numericGroundedness: number | null
  /** Numbers asserted by the answer that the context does not support. */
  ungroundedNumbers: string[]
  /** The answer used at least some markdown structure. */
  markdownFormatted: boolean
  /** Characters. Useful for spotting a model that answers by writing an essay. */
  length: number
}

/**
 * Phrases that mean "I am not answering this".
 *
 * Tuned against NOMAD's actual rag_context prompt, which instructs the model to
 * answer from general knowledge rather than hedge — so a hedge here is either a
 * correct refusal on an out-of-corpus question or a prompt regression on an
 * answerable one. Which of those it is, is exactly what `refusalCorrect` says.
 */
const REFUSAL_PATTERNS: RegExp[] = [
  /\bi (?:don'?t|do not) (?:know|have)\b/i,
  /\bi(?:'m| am) (?:not able|unable) to\b/i,
  /\bi (?:couldn'?t|could not|can'?t|cannot) find\b/i,
  /\b(?:no|not enough) (?:information|details|data)\b/i,
  /\b(?:does|do) not (?:contain|include|mention|specify|provide|cover)\b/i,
  /\b(?:isn'?t|is not|aren'?t|are not) (?:mentioned|specified|covered|available|provided)\b/i,
  /\bnot (?:mentioned|specified|covered|stated|documented)\b/i,
  /\bunable to (?:answer|determine|find)\b/i,
  /\bthere (?:is|'s) no (?:information|mention|record)\b/i,
  // "I'd" has no space before the contraction, so this cannot reuse the
  // `i (?:would|'d)` shape used above.
  /\bi(?:'d| would) need more\b/i,
]

/**
 * Phrases that narrate the retrieval machinery.
 *
 * The rag_context prompt explicitly forbids these ("Never narrate your
 * retrieval or reasoning process"), so any hit is a measurable prompt
 * regression. This is the cheapest, sharpest signal in the whole harness: pure
 * regex, zero ambiguity, and it catches a bad prompt edit on the first run.
 */
const LEAKAGE_PATTERNS: RegExp[] = [
  /\b(?:according to|based on|per|from) the (?:provided |retrieved |given |supplied )?context\b/i,
  /\bcontext \d+\b/i,
  /\bthe knowledge ?base\b/i,
  /\bthe (?:provided|retrieved|supplied|given) (?:documents?|passages?|excerpts?|text)\b/i,
  /\bthe context (?:does not|doesn'?t|is|was|seems|appears)\b/i,
  /\b(?:in|from) the (?:documents?|passages?) (?:provided|above|below)\b/i,
  // "I wasn't able to find specific context regarding X, but here's a general
  // answer" is the verbatim symptom that started NOMAD's RAG work. It is both a
  // refusal and a leak, and it is the single most important string this
  // detector has to catch — a prompt change that brings it back must fail
  // loudly on the very next run.
  /\b(?:no|any|specific|relevant) context\b/i,
  /\bsearch results?\b/i,
]

/** Reasoning-model tags that must never reach the user. */
const THINK_TAG = /<\/?(?:think|thought|thinking|reasoning)\b[^>]*>/i

export function detectRefusal(answer: string): boolean {
  return REFUSAL_PATTERNS.some((re) => re.test(answer))
}

export function detectLeakage(answer: string): string[] {
  return LEAKAGE_PATTERNS.filter((re) => re.test(answer)).map((re) => re.source)
}

export function hasThinkTagLeak(answer: string): boolean {
  return THINK_TAG.test(answer)
}

/**
 * Loose markdown check: a header, a list, emphasis, a table, or a code fence.
 *
 * Deliberately loose. SYSTEM_PROMPTS.default asks for markdown "for
 * readability", not for a specific structure, so requiring headers would fail
 * perfectly good one-sentence answers. This only catches a model that has
 * stopped formatting entirely.
 */
export function isMarkdownFormatted(answer: string): boolean {
  return /(^|\n)\s{0,3}#{1,6}\s|(^|\n)\s*[-*+]\s|(^|\n)\s*\d+\.\s|\*\*[^*]+\*\*|`[^`]+`|(^|\n)\s*\|/.test(
    answer
  )
}

/**
 * Numeric tokens the answer asserts, normalized for comparison.
 *
 * Numbers are the highest-value fabrication signal in this domain: a wrong
 * boiling time, bleach dose, or canner pressure is a wrong answer with real
 * consequences, and it is exactly the kind of specific the rag_context prompt
 * forbids inventing.
 *
 * Thousands separators are stripped so "2,000" and "2000" compare equal.
 */
export function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  const normalized = matches.map((m) => m.replace(/,/g, '').replace(/\.0+$/, ''))
  return [...new Set(normalized)]
}

/**
 * Fraction of the answer's numeric claims that the injected context supports.
 *
 * Returns null when the answer contains no numbers — a qualitative answer is
 * not ungrounded, it is just not measurable this way, and folding it in as 1.0
 * would quietly inflate the score.
 *
 * **Known limitation, stated plainly:** this only sees numbers. An answer that
 * fabricates a procedure or a proper noun scores a perfect 1.0 here. It is a
 * fabrication *detector*, not a faithfulness *guarantee* — the LLM-judge tier
 * exists for the rest. Small integers (0-10) are excluded because they appear
 * incidentally in almost any prose ("3 layers", "step 2") and would swamp the
 * signal with false grounding.
 */
export function numericGroundedness(
  answer: string,
  context: string
): { score: number | null; ungrounded: string[] } {
  const contextNumbers = new Set(extractNumbers(context))
  const claimed = extractNumbers(answer).filter((n) => {
    const value = Number.parseFloat(n)
    return !Number.isNaN(value) && value > 10
  })
  if (claimed.length === 0) return { score: null, ungrounded: [] }
  const ungrounded = claimed.filter((n) => !contextNumbers.has(n))
  return { score: (claimed.length - ungrounded.length) / claimed.length, ungrounded }
}

/** Which of a golden's patterns matched, using case-insensitive regex semantics. */
export function matchPatterns(answer: string, patterns: string[]): { matched: string[]; missed: string[] } {
  const matched: string[] = []
  const missed: string[] = []
  for (const pattern of patterns) {
    if (new RegExp(pattern, 'i').test(answer)) matched.push(pattern)
    else missed.push(pattern)
  }
  return { matched, missed }
}

export type ScoreAnswerInput = {
  answer: string
  /** The context text actually injected into the prompt; '' when none was. */
  context: string
  mustInclude: string[]
  mustNotInclude: string[]
  expectRefusal: boolean
}

export function scoreAnswer(input: ScoreAnswerInput): GenerationScores {
  const { answer, context, mustInclude, mustNotInclude, expectRefusal } = input

  const required = matchPatterns(answer, mustInclude)
  const forbidden = matchPatterns(answer, mustNotInclude)
  const refused = detectRefusal(answer)
  const grounding = numericGroundedness(answer, context)

  return {
    // An out-of-corpus question has no mustInclude patterns, so `correct` there
    // is carried entirely by refusalCorrect below rather than by assertions.
    correct: required.missed.length === 0 && forbidden.matched.length === 0,
    matchedRequired: required.matched,
    missedRequired: required.missed,
    hitForbidden: forbidden.matched,
    refused,
    refusalCorrect: expectRefusal ? refused : !refused,
    leakage: detectLeakage(answer),
    thinkTagLeak: hasThinkTagLeak(answer),
    numericGroundedness: grounding.score,
    ungroundedNumbers: grounding.ungrounded,
    markdownFormatted: isMarkdownFormatted(answer),
    length: answer.length,
  }
}

// --- aggregation over repeats -------------------------------------------------

export type RepeatStats = {
  /** How many of N repeats passed. */
  passes: number
  repeats: number
  passRate: number
  /**
   * True when the outcome was neither always-pass nor always-fail. Unstable
   * cases are excluded from gating — treating a coin flip as a regression is
   * how a harness loses the team's trust in one afternoon.
   */
  unstable: boolean
}

export function summarizeRepeats(outcomes: boolean[]): RepeatStats {
  const repeats = outcomes.length
  const passes = outcomes.filter(Boolean).length
  return {
    passes,
    repeats,
    passRate: repeats === 0 ? 0 : passes / repeats,
    unstable: repeats > 1 && passes > 0 && passes < repeats,
  }
}

export type NumericSummary = { mean: number; stddev: number; n: number }

/**
 * Mean and population standard deviation, ignoring nulls.
 *
 * The stddev is not decoration: with temperature 0 it should be near zero, and
 * a non-trivial value is the harness telling you the run is noisier than the
 * difference you are about to interpret.
 */
export function summarizeNumeric(values: Array<number | null>): NumericSummary | null {
  const defined = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (defined.length === 0) return null
  const mean = defined.reduce((a, b) => a + b, 0) / defined.length
  const variance = defined.reduce((acc, v) => acc + (v - mean) ** 2, 0) / defined.length
  return { mean, stddev: Math.sqrt(variance), n: defined.length }
}
