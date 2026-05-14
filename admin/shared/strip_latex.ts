/**
 * Strip LaTeX/MathJax syntax from LLM-generated text and replace common
 * macros with plain-text equivalents. Shared between server (save-time, in
 * ollama_controller) and client (render-time, in ChatMessageBubble) so the
 * scrubbing is identical regardless of whether the user is watching a live
 * stream or reading a reloaded message.
 *
 * Background: the model is trained to format math with `\[ ... \]`,
 * `\text{...}`, `\frac{a}{b}`, etc. The chat's ReactMarkdown pipeline does
 * not parse LaTeX, so without this pass the user sees raw `\text{40 gallons}`.
 * The off-grid system prompt forbids LaTeX but the model resists; this
 * is the deterministic backstop.
 *
 * Best-effort: unwraps the common delimiters and macros NOMAD has actually
 * seen the model emit. Nested-brace edge cases (e.g. `\text{X \times Y}`)
 * fall back to leaving inner contents intact.
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
    // Collapse any double spaces introduced by the replacements.
    .replace(/[ \t]{2,}/g, ' ')
}
