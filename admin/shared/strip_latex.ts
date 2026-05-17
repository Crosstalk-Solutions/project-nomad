/**
 * Deterministic output scrubbers for LLM-generated chat content. Shared
 * between server (save-time, in ollama_controller) and client (render-time,
 * in ChatMessageBubble) so scrubbing is identical regardless of whether the
 * user is watching a live stream or reading a reloaded message.
 *
 * Background: the off-grid persona prompts forbid LaTeX, closing-paragraph
 * hedges, and non-English script slips. The model honors these rules ~95%
 * of the time on single-turn questions; in multi-turn conversations the
 * system-prompt salience decays and the model resists more. These passes
 * are the deterministic backstop so the user never sees the leaks.
 *
 * Three independent passes, each idempotent and safe to call in either
 * order. `cleanChatOutput()` runs them all.
 */
/**
 * Strip LaTeX/MathJax syntax from text and replace common macros with
 * plain-text equivalents. The chat's ReactMarkdown pipeline does not render
 * LaTeX, so without this the user sees raw `\text{40 gallons}`.
 */
export function stripLatex(text: string): string {
  if (!text) return text

  return text
    // Display math delimiters: \[ ... \] — strip just the delimiters,
    // keep the inner expression as plain text.
    .replace(/\\\[\s*/g, '')
    .replace(/\s*\\\]/g, '')
    // Inline math delimiters: \( ... \)
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    // Display math: $$ ... $$
    .replace(/\$\$/g, '')
    // \text{X} → X
    .replace(/\\text\{([^}]*)\}/g, '$1')
    // \mathrm{X} → X (occasionally used for units)
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    // Common binary operators → unicode glyphs
    .replace(/\\times\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\pm\b/g, '±')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\leq\b/g, '≤')
    .replace(/\\geq\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    // Fractions: \frac{a}{b} → (a)/(b)
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    // Square root: \sqrt{x} → sqrt(x)
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    // Subscript / superscript with braces: x_{1} → x_1, x^{2} → x^2
    .replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/\^\{([^}]*)\}/g, '^$1')
    // LaTeX spacing macros: \, (thin), \: (medium), \; (thick), \! (negative),
    // \quad, \qquad. Replace with a regular space (most useful in flowing text).
    .replace(/\\(?:quad|qquad)\b/g, ' ')
    .replace(/\\[,:;!]/g, ' ')
    // LaTeX-escaped special characters → the literal character.
    // \% → %, \$ → $, \& → &, \# → #, \_ → _
    .replace(/\\([%$&#_])/g, '$1')
    // Collapse any double spaces introduced by the replacements.
    .replace(/[ \t]{2,}/g, ' ')
}

// ---------------------------------------------------------------------------

/**
 * Patterns that strongly indicate a "closing hedge" paragraph the OFFGRID_BASELINE
 * rule forbids. Matched anywhere in the candidate paragraph.
 */
const HEDGE_CONTENT = /\b(?:consult\s+(?:a|an|with|someone|the)\s+(?:licensed|qualified|professional|expert|electrician|plumber|doctor|installer|vet|veterinarian)|always\s+(?:consult|prioritize\s+safety|check\s+(?:local|with)|remember|ensure)|remember,?\s+legality|legality\s+varies|if\s+you[’']?re\s+(?:not\s+)?(?:sure|comfortable|unsure)|consider\s+(?:seeking|reaching\s+out|hiring)|seek\s+(?:professional|advice|help\s+from)|follow\s+industry\s+standards|depending\s+on\s+your\s+(?:specific|particular)\s+(?:situation|jurisdiction|location))/i

/**
 * Patterns at the START of a paragraph that mark it as a hedge preamble
 * rather than substantive content.
 */
const HEDGE_STARTER = /^\s*(?:always\b|remember\b|note:|important:|caution:|warning:|disclaimer:|please\s+(?:note|remember|consult)|safety reminder|be\s+sure\s+to\s+(?:consult|check)|if\s+you[’']?re\s+(?:not\s+)?(?:sure|comfortable|unsure))/i

/**
 * Strip a trailing "closing hedge" paragraph from chat output. Conservative:
 * only removes the LAST paragraph, and only if it's short and either starts
 * with a hedge marker OR contains a hedge phrase like "consult a
 * professional." Substantive paragraphs that incidentally mention "consult"
 * once are left alone.
 *
 * If the entire response is a single paragraph, nothing is stripped — we
 * never want to leave the user with empty output.
 */
export function stripHedgeCloser(text: string): string {
  if (!text) return text
  const paragraphs = text.split(/\n\n+/)
  if (paragraphs.length < 2) return text
  const last = paragraphs[paragraphs.length - 1].trim()
  if (!last) return text
  // Long paragraphs likely carry real content; don't drop.
  if (last.length > 400) return text
  const isHedgeShaped = HEDGE_STARTER.test(last) || HEDGE_CONTENT.test(last)
  if (!isHedgeShaped) return text
  return paragraphs.slice(0, -1).join('\n\n').trimEnd()
}

/**
 * The model (qwen2.5-family especially) occasionally slips into CJK or
 * Cyrillic script mid-response. The English-only rule helps but doesn't
 * fully prevent it. This pass truncates at the first non-Latin character,
 * preferring to cut at a sentence boundary so the trailing English is clean.
 *
 * Latin-1 supplement, common punctuation, and standard symbols are all kept.
 * Only catches: CJK Unified Ideographs, Hiragana, Katakana, Hangul, Cyrillic,
 * Hebrew, Arabic.
 */
const NON_LATIN_SCRIPT_RANGE = /[一-鿿぀-ヿ가-힯Ѐ-ӿ֐-׿؀-ۿ]/

export function truncateAtNonLatin(text: string): string {
  if (!text) return text
  const idx = text.search(NON_LATIN_SCRIPT_RANGE)
  if (idx === -1) return text
  // Try to cut at the most recent sentence boundary before the leak.
  const before = text.slice(0, idx)
  const cuts = [before.lastIndexOf('. '), before.lastIndexOf('.\n'), before.lastIndexOf('\n\n'), before.lastIndexOf('! '), before.lastIndexOf('? ')]
  const sentenceEnd = Math.max(...cuts)
  if (sentenceEnd >= 0) {
    return text.slice(0, sentenceEnd + 1).trimEnd()
  }
  // No clean sentence boundary — truncate at the first non-Latin character.
  return before.trimEnd()
}

/**
 * Run all chat-output scrubbers. Order matters: LaTeX first (so a hedge
 * line buried in LaTeX is recognizable to the hedge stripper), then
 * non-Latin truncation (so we don't drop a "hedge" paragraph that's
 * actually a Chinese-leak hallucination), then hedge-closer last.
 */
export function cleanChatOutput(text: string): string {
  if (!text) return text
  return stripHedgeCloser(truncateAtNonLatin(stripLatex(text)))
}
