import {
  ListRemoteZimFilesResponse,
  RawRemoteZimFileEntry,
  RemoteZimFileEntry,
} from '../../types/zim.js'
import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { isRawListRemoteZimFilesResponse, isRawRemoteZimFileEntry } from '../../util/zim.js'
import transmit from '@adonisjs/transmit/services/main'
import logger from '@adonisjs/core/services/logger'
import { DockerService } from './docker_service.js'
import { inject } from '@adonisjs/core'
import { doBackgroundDownload } from '../utils/downloads.js'
import {
  deleteFileIfExists,
  ensureDirectoryExists,
  getFileStatsIfExists,
  listDirectoryContents,
} from '../utils/fs.js'
import { join } from 'path'

const ZIM_MIME_TYPES = ['application/x-zim', 'application/x-openzim', 'application/octet-stream']
const BROADCAST_CHANNEL = 'zim-downloads'

@inject()
export class ZimService {
  private zimStoragePath = '/storage/zim'
  private activeDownloads = new Map<string, AbortController>()

  constructor(private dockerService: DockerService) {}

  async list() {
    const dirPath = join(process.cwd(), this.zimStoragePath)

    await ensureDirectoryExists(dirPath)

    const files = await listDirectoryContents(dirPath)

    return {
      files,
    }
  }

  async listRemote({
    start,
    count,
  }: {
    start: number
    count: number
  }): Promise<ListRemoteZimFilesResponse> {
    const LIBRARY_BASE_URL = 'https://browse.library.kiwix.org/catalog/v2/entries'

    const res = await axios.get(LIBRARY_BASE_URL, {
      params: {
        start: start,
        count: count,
        lang: 'eng',
      },
      responseType: 'text',
    })

    const data = res.data
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '#text',
    })
    const result = parser.parse(data)

    if (!isRawListRemoteZimFilesResponse(result)) {
      throw new Error('Invalid response format from remote library')
    }

    const filtered = result.feed.entry.filter((entry: any) => {
      return isRawRemoteZimFileEntry(entry)
    })

    const mapped: (RemoteZimFileEntry | null)[] = filtered.map((entry: RawRemoteZimFileEntry) => {
      const downloadLink = entry.link.find((link: any) => {
        return (
          typeof link === 'object' &&
          'rel' in link &&
          'length' in link &&
          'href' in link &&
          'type' in link &&
          link.type === 'application/x-zim'
        )
      })

      if (!downloadLink) {
        return null
      }

      // downloadLink['href'] will end with .meta4, we need to remove that to get the actual download URL
      const download_url = downloadLink['href'].substring(0, downloadLink['href'].length - 6)
      const file_name = download_url.split('/').pop() || `${entry.title}.zim`
      const sizeBytes = parseInt(downloadLink['length'], 10)

      return {
        id: entry.id,
        title: entry.title,
        updated: entry.updated,
        summary: entry.summary,
        size_bytes: sizeBytes || 0,
        download_url: download_url,
        author: entry.author.name,
        file_name: file_name,
      }
    })

    // Filter out any null entries (those without a valid download link)
    // or files that already exist in the local storage
    const existing = await this.list()
    const existingKeys = new Set(existing.files.map((file) => file.name))
    const withoutExisting = mapped.filter(
      (entry): entry is RemoteZimFileEntry => entry !== null && !existingKeys.has(entry.file_name)
    )

    return {
      items: withoutExisting,
      has_more: result.feed.totalResults > start,
      total_count: result.feed.totalResults,
    }
  }

  async downloadRemote(url: string): Promise<string> {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('.zim')) {
      throw new Error(`Invalid ZIM file URL: ${url}. URL must end with .zim`)
    }

    const existing = this.activeDownloads.get(url)
    if (existing) {
      throw new Error(`Download already in progress for URL ${url}`)
    }

    await ensureDirectoryExists(join(process.cwd(), this.zimStoragePath))

    // Extract the filename from the URL
    const filename = url.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const path = join(process.cwd(), this.zimStoragePath, filename)

    // Don't await the download, run it in the background
    doBackgroundDownload({
      url,
      path,
      channel: BROADCAST_CHANNEL,
      activeDownloads: this.activeDownloads,
      allowedMimeTypes: ZIM_MIME_TYPES,
      timeout: 30000,
      forceNew: true,
      onComplete: async () => {
        // Restart KIWIX container to pick up new ZIM file
        await this.dockerService
          .affectContainer(DockerService.KIWIX_SERVICE_NAME, 'restart')
          .catch((error) => {
            logger.error(`Failed to restart KIWIX container:`, error) // Don't stop the download completion, just log the error.
          })
      },
    })

    return filename
  }

  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys())
  }

  cancelDownload(url: string): boolean {
    const entry = this.activeDownloads.get(url)
    if (entry) {
      entry.abort()
      this.activeDownloads.delete(url)
      transmit.broadcast(BROADCAST_CHANNEL, { url, status: 'cancelled' })
      return true
    }
    return false
  }

  async delete(file: string): Promise<void> {
    let fileName = file
    if (!fileName.endsWith('.zim')) {
      fileName += '.zim'
    }

    const fullPath = join(process.cwd(), this.zimStoragePath, fileName)

    const exists = await getFileStatsIfExists(fullPath)
    if (!exists) {
      throw new Error('not_found')
    }

    await deleteFileIfExists(fullPath)
  }
}
