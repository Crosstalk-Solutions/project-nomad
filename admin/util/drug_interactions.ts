/**
 * Parse a flattened FDA label section (drug interactions, dosage, warnings,
 * contraindications, indications, ...) into ordered blocks for readable
 * rendering. The split is purely structural: every word of the original text is
 * preserved in order — only the numbered-subsection and bullet markers move into
 * block metadata. No FDA wording is altered, summarized, or dropped. The
 * content-fidelity invariant is enforced by the unit tests.
 */

/** One renderable block of parsed FDA label text. */
export interface LabelBlock {
  /** Subsection label like "7.1", or null for intro/header text. */
  label: string | null
  /** Verbatim text (subsection label stripped from the front), or null for a bullet block. */
  text: string | null
  /** Verbatim bullet items, or null for a text block. */
  bullets: string[] | null
}

/** Backward-compatible alias — the interaction comparison view's original name. */
export type InteractionBlock = LabelBlock

// A section's own leading header: a number then an ALL-CAPS section name, e.g.
// "7 DRUG INTERACTIONS", "2 DOSAGE AND ADMINISTRATION". Anchoring subsection
// detection to THIS section's number means inline cross-refs like "(12.3)" or
// "( 7.1 )" are never mistaken for a subsection heading.
const HEADER_RE = /^\s*(\d{1,2})\s+[A-Z][A-Z][A-Z &,/()'.’-]*/
// "<major>.<n> <Capital><lowercase>" subsection number, for the no-header fallback.
const SUBSECTION_RE = /\b(\d{1,2})\.\d{1,2}\s+[A-Z][a-z]/g

/** This section's major number — from its leading header, else the dominant subsection major. */
function detectMajor(text: string): string | null {
  const header = text.match(HEADER_RE)
  if (header) return header[1]
  const counts = new Map<string, number>()
  for (const m of text.matchAll(SUBSECTION_RE)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [major, n] of counts) {
    if (n > bestN) {
      best = major
      bestN = n
    }
  }
  return best
}

export function parseLabelSection(raw: string | null | undefined): LabelBlock[] {
  if (!raw) return []
  const text = raw.trim()
  if (!text) return []

  const major = detectMajor(text)

  let pieces: string[]
  let labelRe: RegExp | null = null
  if (major) {
    // Split before "<major>.<n> <Capital><lowercase>". The \b prevents matching
    // inside a larger number (e.g. "17.1"); the [A-Z][a-z] requirement excludes
    // parenthetical refs like "( 7.1 )" (those are followed by ")"). Lookahead
    // only — no lookbehind — for broad browser support.
    const splitRe = new RegExp(`(?=\\b${major}\\.\\d{1,2}\\s+[A-Z][a-z])`)
    pieces = text.split(splitRe)
    labelRe = new RegExp(`^(${major}\\.\\d{1,2})\\s+`)
  } else {
    pieces = [text]
  }

  const blocks: LabelBlock[] = []
  for (const rawPiece of pieces) {
    const piece = rawPiece.trim()
    if (!piece) continue

    let label: string | null = null
    let body = piece
    if (labelRe) {
      const m = piece.match(labelRe)
      if (m) {
        label = m[1]
        body = piece.slice(m[0].length).trim()
      }
    }

    if (body.includes('•')) {
      const parts = body.split('•')
      const lead = parts[0].trim()
      const items = parts
        .slice(1)
        .map((s) => s.trim())
        .filter(Boolean)
      if (lead) {
        blocks.push({ label, text: lead, bullets: null })
        if (items.length) blocks.push({ label: null, text: null, bullets: items })
      } else if (items.length) {
        blocks.push({ label, text: null, bullets: items })
      }
    } else if (body) {
      blocks.push({ label, text: body, bullets: null })
    }
  }

  return blocks
}

/** Backward-compatible alias for the interaction comparison view. */
export const parseInteractions = parseLabelSection

/** True when a text block is just a "N SECTION NAME" FDA section header. */
export function isLabelSectionHeader(text: string | null): boolean {
  return !!text && /^\s*\d{1,2}\s+[A-Z][A-Z][A-Z &,/()'.’-]*$/.test(text)
}

/** Backward-compatible alias. */
export const isSectionHeader = isLabelSectionHeader
