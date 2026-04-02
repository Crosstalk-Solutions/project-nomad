import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { readFile, writeFile, rename, readdir } from 'fs/promises'
import { join } from 'path'
import { Archive } from '@openzim/libzim'
import { KIWIX_LIBRARY_XML_PATH, ZIM_STORAGE_PATH, ensureDirectoryExists } from '../utils/fs.js'
import logger from '@adonisjs/core/services/logger'
import { randomUUID } from 'node:crypto'

const CONTAINER_DATA_PATH = '/data'
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n'

interface KiwixBook {
  id: string
  path: string
  title: string
  description?: string
  language?: string
  creator?: string
  publisher?: string
  name?: string
  flavour?: string
  tags?: string
  faviconMimeType?: string
  favicon?: string
  date?: string
  articleCount?: number
  mediaCount?: number
  size?: number
}

export class KiwixLibraryService {
  getLibraryFilePath(): string {
    return join(process.cwd(), KIWIX_LIBRARY_XML_PATH)
  }

  containerLibraryPath(): string {
    return '/data/kiwix-library.xml'
  }

  private _filenameToTitle(filename: string): string {
    const withoutExt = filename.endsWith('.zim') ? filename.slice(0, -4) : filename
    const parts = withoutExt.split('_')
    // Drop last segment if it looks like a date (YYYY-MM)
    const lastPart = parts[parts.length - 1]
    const isDate = /^\d{4}-\d{2}$/.test(lastPart)
    const titleParts = isDate && parts.length > 1 ? parts.slice(0, -1) : parts
    return titleParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
  }

  /**
   * Reads all kiwix-manage-compatible metadata from a ZIM file, including the internal UUID,
   * rich text fields, and the base64-encoded favicon. Kiwix-serve uses the UUID for OPDS
   * catalog entries and illustration URLs (/catalog/v2/illustration/{uuid}).
   *
   * Returns null on any error so callers can fall back gracefully.
   */
  private _readZimMetadata(zimFilePath: string): Partial<KiwixBook> | null {
    try {
      const archive = new Archive(zimFilePath)

      const getMeta = (key: string): string | undefined => {
        try {
          return archive.getMetadata(key) || undefined
        } catch {
          return undefined
        }
      }

      let favicon: string | undefined
      let faviconMimeType: string | undefined
      try {
        if (archive.illustrationSizes.size > 0) {
          const size = archive.illustrationSizes.has(48)
            ? 48
            : ([...archive.illustrationSizes][0] as number)
          const item = archive.getIllustrationItem(size)
          favicon = item.data.data.toString('base64')
          faviconMimeType = item.mimetype || undefined
        }
      } catch {
        // ZIM has no illustration — that's fine
      }

      const rawFilesize =
        typeof archive.filesize === 'bigint' ? Number(archive.filesize) : archive.filesize

      return {
        id: archive.uuid || undefined,
        title: getMeta('Title'),
        description: getMeta('Description'),
        language: getMeta('Language'),
        creator: getMeta('Creator'),
        publisher: getMeta('Publisher'),
        name: getMeta('Name'),
        flavour: getMeta('Flavour'),
        tags: getMeta('Tags'),
        date: getMeta('Date'),
        articleCount: archive.articleCount,
        mediaCount: archive.mediaCount,
        size: Math.floor(rawFilesize / 1024),
        favicon,
        faviconMimeType,
      }
    } catch {
      return null
    }
  }

  private _buildXml(books: KiwixBook[]): string {
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      suppressEmptyNode: false,
    })

    const obj: Record<string, any> = {
      library: {
        '@_version': '20110515',
        ...(books.length > 0 && {
          book: books.map((b) => ({
            '@_id': b.id,
            '@_path': b.path,
            '@_title': b.title,
            ...(b.description !== undefined && { '@_description': b.description }),
            ...(b.language !== undefined && { '@_language': b.language }),
            ...(b.creator !== undefined && { '@_creator': b.creator }),
            ...(b.publisher !== undefined && { '@_publisher': b.publisher }),
            ...(b.name !== undefined && { '@_name': b.name }),
            ...(b.flavour !== undefined && { '@_flavour': b.flavour }),
            ...(b.tags !== undefined && { '@_tags': b.tags }),
            ...(b.faviconMimeType !== undefined && { '@_faviconMimeType': b.faviconMimeType }),
            ...(b.favicon !== undefined && { '@_favicon': b.favicon }),
            ...(b.date !== undefined && { '@_date': b.date }),
            ...(b.articleCount !== undefined && { '@_articleCount': b.articleCount }),
            ...(b.mediaCount !== undefined && { '@_mediaCount': b.mediaCount }),
            ...(b.size !== undefined && { '@_size': b.size }),
          })),
        }),
      },
    }

    return XML_DECLARATION + builder.build(obj)
  }

  private async _atomicWrite(content: string): Promise<void> {
    const filePath = this.getLibraryFilePath()
    const tmpPath = `${filePath}.tmp.${randomUUID()}`
    await writeFile(tmpPath, content, 'utf-8')
    await rename(tmpPath, filePath)
  }

  private _parseExistingBooks(xmlContent: string): KiwixBook[] {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'book',
    })

    const parsed = parser.parse(xmlContent)
    const books: any[] = parsed?.library?.book ?? []

    return books
      .map((b) => ({
        id: b['@_id'] ?? '',
        path: b['@_path'] ?? '',
        title: b['@_title'] ?? '',
        description: b['@_description'],
        language: b['@_language'],
        creator: b['@_creator'],
        publisher: b['@_publisher'],
        name: b['@_name'],
        flavour: b['@_flavour'],
        tags: b['@_tags'],
        faviconMimeType: b['@_faviconMimeType'],
        favicon: b['@_favicon'],
        date: b['@_date'],
        articleCount:
          b['@_articleCount'] !== undefined ? Number(b['@_articleCount']) : undefined,
        mediaCount: b['@_mediaCount'] !== undefined ? Number(b['@_mediaCount']) : undefined,
        size: b['@_size'] !== undefined ? Number(b['@_size']) : undefined,
      }))
      .filter((b) => b.id && b.path)
  }

  async rebuildFromDisk(opts?: { excludeFilenames?: string[] }): Promise<void> {
    const dirPath = join(process.cwd(), ZIM_STORAGE_PATH)
    await ensureDirectoryExists(dirPath)

    let entries: string[] = []
    try {
      entries = await readdir(dirPath)
    } catch {
      entries = []
    }

    const excludeSet = new Set(opts?.excludeFilenames ?? [])
    const zimFiles = entries.filter((name) => name.endsWith('.zim') && !excludeSet.has(name))

    const books: KiwixBook[] = zimFiles.map((filename) => {
      const meta = this._readZimMetadata(join(dirPath, filename))
      const containerPath = `${CONTAINER_DATA_PATH}/${filename}`
      return {
        ...meta,
        // Override fields that must be derived locally, not from ZIM metadata
        id: meta?.id ?? filename.slice(0, -4),
        path: containerPath,
        title: meta?.title ?? this._filenameToTitle(filename),
      }
    })

    const xml = this._buildXml(books)
    await this._atomicWrite(xml)
    logger.info(`[KiwixLibraryService] Rebuilt library XML with ${books.length} book(s).`)
  }

  async addBook(filename: string): Promise<void> {
    const zimFilename = filename.endsWith('.zim') ? filename : `${filename}.zim`
    const containerPath = `${CONTAINER_DATA_PATH}/${zimFilename}`

    const filePath = this.getLibraryFilePath()
    let existingBooks: KiwixBook[] = []

    try {
      const content = await readFile(filePath, 'utf-8')
      existingBooks = this._parseExistingBooks(content)
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // XML doesn't exist yet — rebuild from disk; the completed download is already there
        await this.rebuildFromDisk()
        return
      }
      throw err
    }

    if (existingBooks.some((b) => b.path === containerPath)) {
      logger.info(`[KiwixLibraryService] ${zimFilename} already in library, skipping.`)
      return
    }

    const fullPath = join(process.cwd(), ZIM_STORAGE_PATH, zimFilename)
    const meta = this._readZimMetadata(fullPath)

    existingBooks.push({
      ...meta,
      id: meta?.id ?? zimFilename.slice(0, -4),
      path: containerPath,
      title: meta?.title ?? this._filenameToTitle(zimFilename),
    })

    const xml = this._buildXml(existingBooks)
    await this._atomicWrite(xml)
    logger.info(`[KiwixLibraryService] Added ${zimFilename} to library XML.`)
  }

  async removeBook(filename: string): Promise<void> {
    const zimFilename = filename.endsWith('.zim') ? filename : `${filename}.zim`
    const containerPath = `${CONTAINER_DATA_PATH}/${zimFilename}`

    const filePath = this.getLibraryFilePath()
    let existingBooks: KiwixBook[] = []

    try {
      const content = await readFile(filePath, 'utf-8')
      existingBooks = this._parseExistingBooks(content)
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        logger.warn(`[KiwixLibraryService] Library XML not found, nothing to remove.`)
        return
      }
      throw err
    }

    const filtered = existingBooks.filter((b) => b.path !== containerPath)

    if (filtered.length === existingBooks.length) {
      logger.info(`[KiwixLibraryService] ${zimFilename} not found in library, nothing to remove.`)
      return
    }

    const xml = this._buildXml(filtered)
    await this._atomicWrite(xml)
    logger.info(`[KiwixLibraryService] Removed ${zimFilename} from library XML.`)
  }
}
