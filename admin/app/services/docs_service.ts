import Markdoc from '@markdoc/markdoc'
import { streamToString } from '../../util/docs.js'
import { getFile, getFileStatsIfExists, listDirectoryContentsRecursive } from '../utils/fs.js'
import path from 'path'

export class DocsService {
  private docsPath = path.join(process.cwd(), 'docs')
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

    return files.sort((a, b) => a.title.localeCompare(b.title))
  }

  parse(content: string) {
    const ast = Markdoc.parse(content)
    const config = this.getConfig()
    const errors = Markdoc.validate(ast, config)

    if (errors.length > 0) {
      throw new Error(`Markdoc validation errors: ${errors.map((e) => e.error).join(', ')}`)
    }

    return Markdoc.transform(ast, config)
  }

  async parseFile(_filename: string) {
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
      },
    }
  }
}
