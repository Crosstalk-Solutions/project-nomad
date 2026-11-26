import * as cheerio from 'cheerio'
import { tableToText } from '../utils/zim_html.js'

/**
 * Thin client for the kiwix-serve HTTP API the agent searches and reads with.
 *
 * Inside the compose network kiwix-serve listens on 8080 under its container
 * name. DockerService.getServiceURL would hand back the host port (8090) with
 * the container name, which is unreachable, so the URL is configured directly.
 * The public URL is what links in answers point at: the browser reaches Kiwix
 * on the host port, not through the compose network.
 */
// process.env rather than #start/env: these helpers are unit-tested without
// booting the app (start/env.ts still declares both for validation).
export function kiwixInternalUrl(): string {
  return (process.env.KIWIX_INTERNAL_URL || 'http://nomad_kiwix_server:8080').replace(/\/$/, '')
}

export function kiwixPublicUrl(): string {
  return (process.env.KIWIX_PUBLIC_URL || 'http://localhost:8090').replace(/\/$/, '')
}

export interface LibraryHit {
  title: string
  book: string
  path: string
  url: string
  snippet: string
}

export interface LibraryBook {
  name: string
  title: string
  summary: string
  language: string
  articleCount: number
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Parses the OpenSearch RSS that `/search?format=xml` returns. */
export function parseSearchXml(xml: string): LibraryHit[] {
  const $ = cheerio.load(xml, { xml: true })
  return $('item')
    .map((_, el) => {
      const item = $(el)
      const path = clean(item.children('link').text())
      const snippet = cheerio.load(item.children('description').text()).text()
      return {
        title: clean(item.children('title').text()),
        book: clean(item.find('book > title').text()),
        path,
        url: kiwixPublicUrl() + path,
        snippet: clean(snippet).slice(0, 280),
      }
    })
    .get()
    .filter((hit) => hit.path.startsWith('/content/'))
}

/** Parses the OPDS feed of `/catalog/v2/entries`. */
export function parseCatalogXml(xml: string): LibraryBook[] {
  const $ = cheerio.load(xml, { xml: true })
  return $('entry')
    .map((_, el) => {
      const entry = $(el)
      const content = entry.find('link[type="text/html"]').attr('href') || ''
      return {
        name: content.replace(/^\/content\//, '') || clean(entry.children('name').text()),
        title: clean(entry.children('title').text()),
        summary: clean(entry.children('summary').text()).slice(0, 160),
        language: clean(entry.children('language').text()),
        articleCount: Number(clean(entry.children('articleCount').text())) || 0,
      }
    })
    .get()
}

/**
 * Article HTML to plain text with headings kept as markdown-ish markers, so the
 * model can see the structure and quote the right section. Tables survive as
 * pipe-delimited rows (the same helper the RAG extractor uses).
 */
export function articleToText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html)
  $(
    'script, style, noscript, nav, footer, .mw-editsection, .reference, sup.reference, .navbox'
  ).remove()
  const title = clean($('title').first().text() || $('h1').first().text())
  const parts: string[] = []
  const root = $('#mw-content-text').length ? $('#mw-content-text') : $('body')
  root.find('h1, h2, h3, h4, p, li, table, pre, blockquote, dd').each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase()
    if (tag === 'table') {
      parts.push(tableToText($, el))
      return
    }
    if ($(el).parents('table').length) return
    if (tag === 'li' && $(el).parents('li').length) return
    const text = clean($(el).text())
    if (!text) return
    if (/^h[1-4]$/.test(tag)) parts.push(`\n${'#'.repeat(Number(tag[1]))} ${text}`)
    else if (tag === 'li') parts.push(`- ${text}`)
    else parts.push(text)
  })
  return {
    title,
    text: parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  }
}

async function get(pathAndQuery: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(kiwixInternalUrl() + pathAndQuery, { signal })
  if (!res.ok) throw new Error(`Kiwix answered ${res.status} for ${pathAndQuery}`)
  return res.text()
}

export async function searchLibrary(
  query: string,
  opts: { book?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<LibraryHit[]> {
  const params = new URLSearchParams({
    pattern: query,
    format: 'xml',
    pageLength: String(Math.min(Math.max(opts.limit ?? 8, 1), 20)),
  })
  if (opts.book) params.set('books.name', opts.book)
  return parseSearchXml(await get(`/search?${params}`, opts.signal))
}

export async function listBooks(signal?: AbortSignal): Promise<LibraryBook[]> {
  return parseCatalogXml(await get('/catalog/v2/entries?count=200', signal))
}

/** Accepts a `/content/...` path or a full Kiwix URL, so the model can pass either back. */
export function normalizeArticlePath(pathOrUrl: string): string {
  let p = pathOrUrl.trim()
  const i = p.indexOf('/content/')
  if (i > 0) p = p.slice(i)
  if (!p.startsWith('/content/')) p = '/content/' + p.replace(/^\/+/, '')
  return p.split('#')[0]
}

export async function readArticle(
  pathOrUrl: string,
  opts: { maxChars?: number; signal?: AbortSignal } = {}
): Promise<{ title: string; path: string; url: string; text: string; truncated: boolean }> {
  const path = normalizeArticlePath(pathOrUrl)
  const { title, text } = articleToText(await get(path, opts.signal))
  const max = Math.min(Math.max(opts.maxChars ?? 6000, 500), 12000)
  return {
    title: title || path.split('/').pop() || path,
    path,
    url: kiwixPublicUrl() + path,
    text: text.slice(0, max),
    truncated: text.length > max,
  }
}
