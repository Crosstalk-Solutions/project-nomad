/**
 * Which pages of a PDF need OCR (#1457).
 *
 * This is the pure, I/O-free core of `RagService.processPDFFile`. It looks at
 * the text pdf-parse extracted for each page and names the pages that carry
 * no usable text layer, so the caller rasterizes and OCRs only those.
 *
 * The decision is per page on purpose. The earlier whole-document gate
 * (`getText().trim().length < 100`) never fired for a scan of six or more
 * pages, because pdf-parse joins pages with `-- 1 of 13 --` separators and
 * those alone add about 17 characters per page. Judging each page by its own
 * text, with no separators in the way, has no such blind spot, and it also
 * covers PDFs that mix scanned and text pages.
 */

/**
 * A page with fewer non-whitespace characters than this is treated as having
 * no text layer. Real text pages run to hundreds or thousands of characters; a
 * scanned page yields nothing, or a stray mark or two from an embedded
 * header. Set well below any genuine page so a title page is at worst OCR'd
 * once more, never skipped.
 */
export const PDF_PAGE_MIN_TEXT_CHARS = 20

export interface PdfOcrPlan {
  /** 1-based page numbers that need OCR, in page order. */
  ocrPages: number[]
  /** Pages that already have a text layer. */
  textPages: number
}

/** True when a page's extracted text is too thin to be a text layer. */
export function pageNeedsOcr(pageText: string): boolean {
  return pageText.replace(/\s+/g, '').length < PDF_PAGE_MIN_TEXT_CHARS
}

/**
 * Decide which pages to OCR. `pages` holds pdf-parse's per-page text, index 0
 * being page 1.
 */
export function decidePdfOcr(pages: string[]): PdfOcrPlan {
  const ocrPages: number[] = []
  for (const [index, text] of pages.entries()) {
    if (pageNeedsOcr(text ?? '')) ocrPages.push(index + 1)
  }
  return { ocrPages, textPages: pages.length - ocrPages.length }
}
