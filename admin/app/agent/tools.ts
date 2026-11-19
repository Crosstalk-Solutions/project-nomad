import { RagService } from '#services/rag_service'
import { listBooks, readArticle, searchLibrary } from './kiwix.js'

/**
 * The chat agent's tools: Ollama-native definitions plus their executors.
 *
 * Every executor returns two views of the same result. `forModel` is compact
 * JSON that goes back into the conversation; `summary` and `links` are for
 * the step list the user watches. Nothing here writes data.
 */

export interface StepLink {
  title: string
  url: string
  kind: 'library' | 'file'
}

export interface ToolOutcome {
  forModel: string
  summary: string
  links?: StepLink[]
}

export interface ToolContext {
  signal: AbortSignal
  ragService: RagService
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_library',
      description:
        'Full-text search in the offline library (Wikipedia, medical references, survival guides, repair guides, cooking). Use English search terms: most books are English. Returns titles, a snippet and the article path.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search terms, preferably English, 2-6 words' },
          book: {
            type: 'string',
            description: 'Optional book name from list_books to search only that book',
          },
          limit: { type: 'number', description: 'Number of hits, default 8, max 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_article',
      description:
        'Read the text of one library article. Pass the path from a search_library hit. Read the most promising 1-2 hits before you answer.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            description:
              'Article path such as /content/wikipedia_en_all_mini_2026-06/Water_purification',
          },
          max_chars: { type: 'number', description: 'Default 6000, max 12000' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_books',
      description:
        'List the books (ZIM archives) in the offline library with their name and topic.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        "Semantic search in the user's own uploaded documents (PDFs, notes). Use when the question is about the user's files.",
      parameters: {
        type: 'object',
        required: ['query'],
        properties: { query: { type: 'string', description: 'What to look for' } },
      },
    },
  },
]

const num = (v: unknown, fallback?: number) => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : fallback
}

export async function runTool(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  switch (name) {
    case 'search_library': {
      const query = String(args.query ?? '').trim()
      if (!query) return { forModel: '{"error":"query is empty"}', summary: 'Empty search' }
      const hits = await searchLibrary(query, {
        book: args.book ? String(args.book) : undefined,
        limit: num(args.limit, 8),
        signal: ctx.signal,
      })
      return {
        forModel: JSON.stringify(
          hits.map(({ title, book, path, snippet }) => ({ title, book, path, snippet }))
        ),
        summary: `${hits.length} hits for “${query}”`,
        links: hits.map((h) => ({
          title: `${h.title} · ${h.book}`,
          url: h.url,
          kind: 'library' as const,
        })),
      }
    }
    case 'read_article': {
      const a = await readArticle(String(args.path ?? ''), {
        maxChars: num(args.max_chars, 6000),
        signal: ctx.signal,
      })
      return {
        forModel: JSON.stringify({
          title: a.title,
          url: a.url,
          truncated: a.truncated,
          text: a.text,
        }),
        summary: `Read: ${a.title}${a.truncated ? ' (shortened)' : ''}`,
        links: [{ title: a.title, url: a.url, kind: 'library' }],
      }
    }
    case 'list_books': {
      const books = await listBooks(ctx.signal)
      return {
        forModel: JSON.stringify(
          books.map((b) => ({
            name: b.name,
            title: b.title,
            summary: b.summary,
            language: b.language,
          }))
        ),
        summary: `${books.length} books in the library`,
      }
    }
    case 'search_knowledge_base': {
      const query = String(args.query ?? '').trim()
      const docs = await ctx.ragService.searchSimilarDocuments(query, 5, 0.3)
      return {
        forModel: JSON.stringify(
          docs.map((d) => ({
            source: d.metadata?.source ?? d.metadata?.title ?? null,
            text: d.text.slice(0, 1200),
          }))
        ),
        summary: `${docs.length} passages in your documents`,
        links: docs
          .filter((d) => d.metadata?.source)
          .map((d) => ({
            title: String(d.metadata?.title ?? d.metadata?.source),
            url: String(d.metadata?.source),
            kind: 'file' as const,
          })),
      }
    }
    default:
      return {
        forModel: JSON.stringify({ error: `unknown tool ${name}` }),
        summary: `Unknown tool ${name}`,
      }
  }
}
