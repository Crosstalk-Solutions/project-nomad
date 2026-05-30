import { ensureDirectoryExists, getFileStatsIfExists, sanitizeFilename } from '../utils/fs.js'
import { createReadStream } from 'node:fs'
import { readFile, readdir, rename, unlink } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import JSZip from 'jszip'
import * as cheerio from 'cheerio'
import { extname, resolve } from 'node:path'
import type {
  LocalLibraryFile,
  LocalLibraryFileType,
  LocalLibraryPreviewResponse,
} from '../../types/local_library.js'

const SUPPORTED_LIBRARY_EXTENSIONS = new Set([
  '.pdf',
  '.epub',
  '.mobi',
  '.azw',
  '.azw3',
  '.txt',
  '.md',
  '.rtf',
  '.docx',
])

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw': 'application/vnd.amazon.ebook',
  '.azw3': 'application/vnd.amazon.ebook',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.rtf': 'application/rtf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export class LocalLibraryService {
  public static STORAGE_PATH = 'storage/local_library'

  getStoragePath(): string {
    return app.makePath(LocalLibraryService.STORAGE_PATH)
  }

  async ensureStorage(): Promise<void> {
    await ensureDirectoryExists(this.getStoragePath())
  }

  sanitizeUploadName(name: string): string {
    const cleaned = sanitizeFilename(name).replace(/^_+/, '')
    if (!cleaned || cleaned === '.' || cleaned === '..') {
      throw new Error('invalid_filename')
    }
    if (!this.isSupportedName(cleaned)) {
      throw new Error('unsupported_file_type')
    }
    return cleaned
  }

  isSupportedName(name: string): boolean {
    return SUPPORTED_LIBRARY_EXTENSIONS.has(extname(name).toLowerCase())
  }

  resolveLibraryPath(filename: string): string {
    const decoded = decodeURIComponent(filename)
    if (decoded.includes('/') || decoded.includes('\\') || decoded === '.' || decoded === '..') {
      throw new Error('invalid_filename')
    }

    const root = resolve(this.getStoragePath())
    const fullPath = resolve(root, decoded)
    if (fullPath !== root && fullPath.startsWith(`${root}/`)) {
      return fullPath
    }
    throw new Error('invalid_filename')
  }

  detectType(name: string): LocalLibraryFileType {
    const ext = extname(name).toLowerCase()
    if (ext === '.pdf') return 'pdf'
    if (ext === '.epub') return 'epub'
    if (['.mobi', '.azw', '.azw3'].includes(ext)) return 'mobi'
    if (['.txt', '.md', '.rtf', '.docx'].includes(ext)) return 'text'
    return 'unknown'
  }

  contentType(name: string): string {
    return MIME_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream'
  }

  async list(): Promise<LocalLibraryFile[]> {
    await this.ensureStorage()
    const names = await readdir(this.getStoragePath())
    const files: LocalLibraryFile[] = []

    for (const name of names) {
      if (!this.isSupportedName(name)) continue
      const fullPath = this.resolveLibraryPath(name)
      const stats = await getFileStatsIfExists(fullPath)
      if (!stats) continue
      const type = this.detectType(name)
      files.push({
        name,
        displayName: name,
        type,
        size: stats.size,
        modifiedTime: stats.modifiedTime.toISOString(),
        viewUrl:
          type === 'pdf' ? `/api/local-library/files/${encodeURIComponent(name)}/view` : null,
        downloadUrl: `/api/local-library/files/${encodeURIComponent(name)}/download`,
        canPreview: type === 'pdf' || type === 'epub' || type === 'text',
        canIndex: type !== 'unknown' && type !== 'mobi',
        indexedSource: fullPath,
      })
    }

    return files.sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  async stream(filename: string) {
    const fullPath = this.resolveLibraryPath(filename)
    const stats = await getFileStatsIfExists(fullPath)
    if (!stats) throw new Error('not_found')
    return {
      stream: createReadStream(fullPath),
      fullPath,
      filename: decodeURIComponent(filename),
      size: stats.size,
      contentType: this.contentType(filename),
    }
  }

  async remove(filename: string): Promise<void> {
    const fullPath = this.resolveLibraryPath(filename)
    await unlink(fullPath)
  }

  async rename(filename: string, requestedName: string): Promise<LocalLibraryFile> {
    const fullPath = this.resolveLibraryPath(filename)
    const newName = this.sanitizeUploadName(requestedName)
    const newPath = this.resolveLibraryPath(newName)
    await rename(fullPath, newPath)
    const files = await this.list()
    const [file] = files.filter((item) => item.name === newName)
    return file
  }

  async preview(filename: string): Promise<LocalLibraryPreviewResponse> {
    const fullPath = this.resolveLibraryPath(filename)
    const type = this.detectType(filename)
    if (type === 'mobi' || type === 'unknown') {
      throw new Error('preview_unsupported')
    }

    if (type === 'epub') {
      return {
        name: decodeURIComponent(filename),
        type,
        title: decodeURIComponent(filename),
        text: await this.extractEpubText(await readFile(fullPath)),
      }
    }

    if (type === 'text') {
      const text = await readFile(fullPath, 'utf-8')
      return { name: decodeURIComponent(filename), type, title: decodeURIComponent(filename), text }
    }

    return {
      name: decodeURIComponent(filename),
      type,
      title: decodeURIComponent(filename),
      text: '',
    }
  }

  private async extractEpubText(fileBuffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(fileBuffer)
    const containerXml = await zip.file('META-INF/container.xml')?.async('text')
    if (!containerXml) throw new Error('invalid_epub')

    const $container = cheerio.load(containerXml, { xml: true })
    const opfPath = $container('rootfile').attr('full-path')
    if (!opfPath) throw new Error('invalid_epub')

    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''
    const opfContent = await zip.file(opfPath)?.async('text')
    if (!opfContent) throw new Error('invalid_epub')

    const $opf = cheerio.load(opfContent, { xml: true })
    const manifestItems = new Map<string, string>()
    $opf('manifest item').each((_, el) => {
      const id = $opf(el).attr('id')
      const href = $opf(el).attr('href')
      const mediaType = $opf(el).attr('media-type') || ''
      if (id && href && (mediaType.includes('html') || mediaType.includes('xml'))) {
        manifestItems.set(id, href)
      }
    })

    const contentFiles: string[] = []
    $opf('spine itemref').each((_, el) => {
      const idref = $opf(el).attr('idref')
      if (idref && manifestItems.has(idref)) contentFiles.push(manifestItems.get(idref)!)
    })
    if (contentFiles.length === 0) contentFiles.push(...manifestItems.values())

    const textParts: string[] = []
    for (const href of contentFiles) {
      const content = await zip.file(opfDir + href)?.async('text')
      if (!content) continue
      const $ = cheerio.load(content)
      $('script, style').remove()
      const text = $('body').text().replace(/\s+/g, ' ').trim()
      if (text) textParts.push(text)
    }
    return textParts.join('\n\n')
  }
}
