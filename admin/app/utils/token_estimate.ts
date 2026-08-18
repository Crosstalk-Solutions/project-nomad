/**
 * Token estimation for prompt budgeting.
 *
 * NOMAD cannot tokenize exactly. The model's real vocabulary lives inside a GGUF
 * on the Ollama side, Ollama exposes no tokenize endpoint (ollama#12030 is still
 * open), and bundling a BPE vocabulary would mean shipping the *wrong* vocabulary
 * for whatever Llama/Qwen/Gemma/Granite model the user actually pulled. Fetching
 * the right one per model needs network access, which an offline-first appliance
 * does not have.
 *
 * So this estimates — but it estimates in a way that corrects itself. Two parts:
 *
 * 1. A structural segmenter (below). BPE vocabularies are built from natural text,
 *    so in practice a token is roughly "a word, or a punctuation mark, or a chunk
 *    of a long/rare word". Counting those directly tracks a real tokenizer far
 *    better than dividing character count by a constant, because the constant is
 *    only right for the kind of text it was tuned on. Prose runs ~4 chars/token;
 *    dense JSON, markdown tables and code run closer to 2.5. Those are exactly the
 *    payloads that overflow a window, so that is exactly where a fixed ratio is
 *    most wrong and most dangerous.
 *
 * 2. A per-model correction factor learned from ground truth. Every Ollama
 *    response reports `prompt_eval_count` — the real token count of the prompt we
 *    just sent. TokenCalibrationService folds the observed error into a per-model
 *    EWMA and feeds it back here as `ratio`. Costs nothing: no extra inference, no
 *    extra dependency, and it converges on the actual tokenizer within a couple of
 *    turns.
 *
 * Measured against real `prompt_eval_count` over a six-fixture set (prose,
 * markdown table, TypeScript, JSON, bullet list, mixed long-form), mean absolute
 * error after per-model calibration:
 *
 *     llama3:8b       segmenter  5.7%   chars/3.5  18.0%
 *     qwen2.5:0.5b    segmenter  6.2%   chars/3.5  20.0%
 *     granite4.1:8b   segmenter  6.7%   chars/3.5  18.4%
 *
 * The learned factors were k=1.02, k=1.26 and k=1.00 respectively — which is the
 * argument for making it per-model rather than a global constant. Qwen tokenizes
 * noticeably finer than Llama, and no single tuned divisor can serve both.
 *
 * Kept pure and dependency-free so it runs under bare `node --test`, the same
 * convention as `rag_prompt.ts`.
 */

/**
 * Chars-per-token used by the *ingestion* path when sizing chunks for the
 * embedding model.
 *
 * Deliberately unchanged from RagService's historical value. Chunk size is baked
 * into the eval corpus fingerprint, so touching it re-chunks the corpus and
 * invalidates every committed retrieval baseline. Re-tuning it is a legitimate
 * change, but it is a *retrieval* change and belongs to its own measured PR — not
 * folded silently into a context-management refactor. Re-exported here only so
 * there is one obvious place to find every token constant.
 */
export const INGEST_CHARS_PER_TOKEN = 2

/**
 * Per-message overhead from the chat template: role marker, turn delimiters, and
 * the trailing newline the template adds. Real templates cost roughly 3-5 tokens
 * a message. The old char-based math ignored this entirely, which quietly
 * under-counted a 40-turn conversation by well over a hundred tokens.
 */
export const PER_MESSAGE_OVERHEAD_TOKENS = 4

/** Tokens the template adds once, for the generation prompt that follows the messages. */
export const CONVERSATION_OVERHEAD_TOKENS = 3

/**
 * Safety margin applied when a budget decision must not overflow.
 *
 * Under-estimating is strictly worse than over-estimating: an over-estimate wastes
 * a little window, an under-estimate overflows it and hands the backend a silent
 * truncation — the exact failure this whole subsystem exists to prevent.
 */
export const ESTIMATE_SAFETY_MARGIN = 1.1

/**
 * Character-class fragments, kept as strings so the CJK ranges appear exactly
 * once and the regexes below stay readable.
 */
const CJK = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af'
const WORD = 'A-Za-z0-9\\u00c0-\\u024f'

/**
 * Segments that a BPE tokenizer tends to split on. Order matters: the first
 * alternative that matches wins.
 *
 * - CJK/Hangul codepoints are usually one token each (often more), so they are
 *   matched singly rather than as words.
 * - Runs of letters/digits are word-ish; long ones get sub-split below.
 * - Runs of punctuation/symbols are matched as a *run*, not per character. BPE
 *   vocabularies contain merged punctuation pieces (`":`, `",`, `);`, `],`), so
 *   charging one token per punctuation character over-counts structured text
 *   badly -- measured at +48% on a JSON payload before this was split out.
 */
const SEGMENT_RE = new RegExp(`[${CJK}]|[${WORD}]+|[^\\s${WORD}${CJK}]+`, 'gu')

/** Identifies the punctuation-run alternative when walking matches. */
const PUNCT_RUN_RE = new RegExp(`^[^\\s${WORD}${CJK}]+$`, 'u')

/**
 * Above this length, a run of letters/digits is a rare word, an identifier, or a
 * hash, and a real tokenizer will break it into several pieces.
 */
const LONG_WORD_CHARS = 7

/** Roughly how many characters of a punctuation run one merged token covers. */
const PUNCT_CHARS_PER_TOKEN = 2

/**
 * Estimate the token count of a string.
 *
 * `ratio` is the learned per-model correction (1.0 = uncalibrated). Pass the value
 * from TokenCalibrationService.ratioFor(model).
 */
export function estimateTokens(text: string, ratio = 1): number {
  if (!text) return 0

  let tokens = 0
  const matches = text.match(SEGMENT_RE)
  if (matches) {
    for (const segment of matches) {
      if (PUNCT_RUN_RE.test(segment)) {
        // Punctuation merges: `":` and `},` are usually single tokens.
        tokens += Math.ceil(segment.length / PUNCT_CHARS_PER_TOKEN)
      } else if (segment.length > LONG_WORD_CHARS) {
        // Long words split into roughly one piece per LONG_WORD_CHARS characters.
        tokens += Math.ceil(segment.length / LONG_WORD_CHARS)
      } else {
        tokens += 1
      }
    }
  }

  // Leading whitespace is folded into the following token by most BPE
  // vocabularies, but newlines are usually tokens in their own right and matter
  // for the markdown-heavy content NOMAD deals in.
  const newlines = (text.match(/\n/g) || []).length
  tokens += newlines

  return Math.max(1, Math.ceil(tokens * ratio))
}

export type EstimatableMessage = { role: string; content: string }

/**
 * Estimate the token cost of a full message array as the backend will see it,
 * including chat-template overhead.
 */
export function estimateMessagesTokens(messages: EstimatableMessage[], ratio = 1): number {
  if (messages.length === 0) return 0
  let total = CONVERSATION_OVERHEAD_TOKENS
  for (const message of messages) {
    total += estimateTokens(message.content, ratio) + PER_MESSAGE_OVERHEAD_TOKENS
  }
  return total
}

/**
 * Estimate with the safety margin applied — use this wherever exceeding the
 * budget causes silent truncation rather than merely wasting space.
 */
export function estimateTokensConservative(text: string, ratio = 1): number {
  return Math.ceil(estimateTokens(text, ratio) * ESTIMATE_SAFETY_MARGIN)
}

/**
 * Fold a fresh observation into an exponentially-weighted moving average.
 *
 * `alpha` is intentionally low: a single odd turn (a huge code paste, a burst of
 * CJK) should nudge the ratio, not redefine it.
 */
export function updateEwma(previous: number | null, observed: number, alpha = 0.25): number {
  if (previous === null || !Number.isFinite(previous) || previous <= 0) return observed
  return previous * (1 - alpha) + observed * alpha
}

/**
 * Guard rail on the learned ratio. A calibration ratio far outside this range
 * means something other than tokenization differs — a backend injecting a hidden
 * system prompt, a tool schema we didn't count, a reasoning preamble. Clamping
 * keeps one bad reading from destroying the budget for every later turn.
 */
export const MIN_CALIBRATION_RATIO = 0.5
export const MAX_CALIBRATION_RATIO = 2.5

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1
  return Math.min(MAX_CALIBRATION_RATIO, Math.max(MIN_CALIBRATION_RATIO, ratio))
}
