/**
 * A PDF's pages joined into passages of consecutive pages, about `size` characters each, labelled
 * with their page range ("page 4", "pages 5-7"), so a search hit in one of a ZIM's PDFs says where
 * in the document it is (#1445).
 */
export function pagePassages(pages: string[], size = 3000): { label: string; text: string }[] {
  const passages: { label: string; text: string }[] = []
  let first = 0
  let text = ''
  pages.forEach((page, i) => {
    text += page.trim() + '\n'
    if (text.length < size && i < pages.length - 1) return
    if (text.trim()) {
      passages.push({
        label: first === i ? `page ${i + 1}` : `pages ${first + 1}-${i + 1}`,
        text: text.trim(),
      })
    }
    first = i + 1
    text = ''
  })
  return passages
}
