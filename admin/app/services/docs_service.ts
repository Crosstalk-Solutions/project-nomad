import Markdoc from '@markdoc/markdoc'
import { streamToString } from '../../util/docs.js'
import { getFile, getFileStatsIfExists, listDirectoryContentsRecursive } from '../utils/fs.js'
import path from 'path'
import InternalServerErrorException from '#exceptions/internal_server_error_exception'

export class DocsService {
  private docsPath = path.join(process.cwd(), 'docs')

  private static readonly DOC_ORDER: Record<string, number> = {
    'home': 1,
    'getting-started': 2,
    'use-cases': 3,
    'faq': 4,
    'about': 5,
    'release-notes': 6,
  }

  async getDocs() {
    const contents = await listDirectoryContentsRecursive(this.docsPath)
    const files: Array<{ title: string; slug: string }> = []

    for (const item of contents) {
      if (item.type === 'file' && item.name.endsWith('.md')) {
        const cleaned = this.prettify(item.name)
        files.push({
          title: cleaned,
          slug: item.name.replace(/\.md$/, ''),
        })
      }
    }

    return files.sort((a, b) => {
      const orderA = DocsService.DOC_ORDER[a.slug] ?? 999
      const orderB = DocsService.DOC_ORDER[b.slug] ?? 999
      return orderA - orderB
    })
  }

  parse(content: string) {
    try {
      const ast = Markdoc.parse(content)
      const config = this.getConfig()
      const errors = Markdoc.validate(ast, config)

      // Filter out attribute-undefined errors which may be caused by emojis and special characters
      const criticalErrors = errors.filter((e) => e.error.id !== 'attribute-undefined')
      if (criticalErrors.length > 0) {
        console.error('Markdoc validation errors:', errors.map((e) => JSON.stringify(e.error)).join(', '))
        throw new Error('Markdoc validation failed')
      }

      return Markdoc.transform(ast, config)
    } catch (error) {
      console.log('Error parsing Markdoc content:', error)
      throw new InternalServerErrorException(`Error parsing content: ${(error as Error).message}`)
    }
  }

  async parseFile(_filename: string) {
    try {
      if (!_filename) {
        throw new Error('Filename is required')
      }

      const filename = _filename.endsWith('.md') ? _filename : `${_filename}.md`

      const fileExists = await getFileStatsIfExists(path.join(this.docsPath, filename))
      if (!fileExists) {
        throw new Error(`File not found: ${filename}`)
      }

      const fileStream = await getFile(path.join(this.docsPath, filename), 'stream')
      if (!fileStream) {
        throw new Error(`Failed to read file stream: ${filename}`)
      }
      const content = await streamToString(fileStream)
      return this.parse(content)
    } catch (error) {
      throw new InternalServerErrorException(`Error parsing file: ${(error as Error).message}`)
    }
  }

  private prettify(filename: string) {
    // Remove hyphens, underscores, and file extension
    const cleaned = filename.replace(/_/g, ' ').replace(/\.md$/, '').replace(/-/g, ' ')
    // Convert to Title Case
    const titleCased = cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
    return titleCased.charAt(0).toUpperCase() + titleCased.slice(1)
  }

  private getConfig() {
    return {
      tags: {
        callout: {
          render: 'Callout',
          attributes: {
            type: {
              type: String,
              default: 'info',
              matches: ['info', 'warning', 'error', 'success'],
            },
            title: {
              type: String,
            },
          },
        },
      },
      nodes: {
        heading: {
          render: 'Heading',
          attributes: {
            level: { type: Number, required: true },
            id: { type: String },
          },
        },
        list: {
          render: 'List',
          attributes: {
            ordered: { type: Boolean },
            start: { type: Number },
          },
        },
        list_item: {
          render: 'ListItem',
          attributes: {
            marker: { type: String },
            className: { type: String },
            class: { type: String }
          }
        },
        table: {
          render: 'Table',
        },
        thead: {
          render: 'TableHead',
        },
        tbody: {
          render: 'TableBody',
        },
        tr: {
          render: 'TableRow',
        },
        th: {
          render: 'TableHeader',
        },
        td: {
          render: 'TableCell',
        },
      },
    }
  }
}
