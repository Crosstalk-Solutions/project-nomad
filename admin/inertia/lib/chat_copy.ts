/**
 * Pure helpers for the chat Copy buttons (#1376).
 */

/** Minimal shape of a hast node as handed to react-markdown components. */
export interface HastLikeNode {
  type?: string
  value?: unknown
  children?: HastLikeNode[]
}

/**
 * Plain text of a rendered fenced code block, taken from the hast `pre` node
 * react-markdown passes to the `pre` component. Reading the AST rather than
 * the rendered React children keeps this independent of how the `code`
 * element is styled. Markdown always ends a fenced block's text with a
 * newline; drop that one so a pasted command doesn't carry a stray line break
 * (which some terminals would execute immediately).
 */
export function codeBlockText(node: HastLikeNode | undefined | null): string {
  const collect = (n: HastLikeNode | undefined | null): string => {
    if (!n) return ''
    if (n.type === 'text' && typeof n.value === 'string') return n.value
    return (n.children ?? []).map(collect).join('')
  }
  return collect(node).replace(/\r?\n$/, '')
}
