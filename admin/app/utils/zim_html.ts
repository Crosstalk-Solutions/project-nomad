import * as cheerio from 'cheerio'
import { NON_CONTENT_HEADING_PATTERNS } from '../../constants/zim_extraction.js'

export interface ZIMSection {
  heading: string
  text: string
  level: number
}

export interface StructuredContent {
  title: string
  sections: ZIMSection[]
  fullText: string
}

/**
 * True when a section heading is one of the low-signal boilerplate headings
 * (See also / References / External links / etc.). Sections under these
 * headings are reference apparatus, not article content, and shouldn't reach
 * the embedder. (#902)
 */
export function isNonContentHeading(heading: string): boolean {
  return NON_CONTENT_HEADING_PATTERNS.some((pattern) => pattern.test(heading))
}

/**
 * Render an HTML <table> into delimited text. cheerio's `.text()` concatenates
 * every cell with no separators ("AgeDoseAdult500mg" word salad), which is
 * unsearchable and pollutes embeddings. Instead, join cells with " | " and rows
 * with newlines so row/column structure survives into the chunk. (#902)
 */
export function tableToText($: cheerio.CheerioAPI, table: any): string {
  const rows: string[] = []
  $(table)
    .find('tr')
    .each((_, tr) => {
      const cells = $(tr)
        .find('th, td')
        .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter((cell) => cell.length > 0)
      if (cells.length > 0) {
        rows.push(cells.join(' | '))
      }
    })
  return rows.join('\n')
}

/**
 * Break a cleaned article's HTML into heading-delimited sections for chunking.
 * Skips non-content sections (References, See also, ...) at emit time and
 * renders tables as delimited text rather than concatenated cell soup. (#902)
 */
export function extractStructuredContent(html: string): StructuredContent {
  const $ = cheerio.load(html)

  const title = $('h1').first().text().trim() || $('title').text().trim()

  const sections: ZIMSection[] = []
  let currentSection = { heading: 'Introduction', content: [] as string[], level: 2, skip: false }

  const flushSection = () => {
    if (!currentSection.skip && currentSection.content.length > 0) {
      sections.push({
        heading: currentSection.heading,
        text: currentSection.content.join(' ').replace(/\s+/g, ' ').trim(),
        level: currentSection.level,
      })
    }
  }

  // Walk the full DOM rather than only direct children of <body>. Modern ZIMs (Devdocs,
  // Wikipedia, FreeCodeCamp, etc.) wrap article content in a container div, which under
  // .children() would be a single non-heading/non-paragraph element and yield zero sections.
  $('body')
    .find('h2, h3, h4, p, ul, ol, dl, table')
    .each((_, element) => {
      const $el = $(element)
      const tagName = element.tagName?.toLowerCase()

      if (['h2', 'h3', 'h4'].includes(tagName)) {
        // Save the section we just finished, then open the next one.
        flushSection()
        const heading = $el
          .text()
          .replace(/\[edit\]/gi, '')
          .trim()
        const level = Number.parseInt(tagName.substring(1)) // Extract number from h2, h3, h4
        currentSection = {
          heading,
          content: [],
          level,
          skip: isNonContentHeading(heading),
        }
      } else if (['p', 'ul', 'ol', 'dl', 'table'].includes(tagName)) {
        // Don't bother collecting content for a section we're going to drop.
        if (currentSection.skip) return
        const text = tagName === 'table' ? tableToText($, element) : $el.text().trim()
        if (text.length > 0) {
          currentSection.content.push(text)
        }
      }
    })

  // Push the last section if it has content
  flushSection()

  // Fallback: if the selector walk produced no sections but the body has meaningful
  // text (unusual structure, minimal markup), emit one section with the full body text
  // so the article still contributes to the knowledge base.
  if (sections.length === 0) {
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    if (bodyText.length > 0) {
      sections.push({
        heading: title || 'Content',
        text: bodyText,
        level: 2,
      })
    }
  }

  return {
    title,
    sections,
    fullText: sections.map((s) => `${s.heading}\n${s.text}`).join('\n\n'),
  }
}
