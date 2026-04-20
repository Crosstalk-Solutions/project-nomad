import { ZimService } from '#services/zim_service'
import {
  assertNotPrivateUrl,
  downloadCategoryTierValidator,
  filenameParamValidator,
  remoteDownloadWithMetadataValidator,
  selectWikipediaValidator,
} from '#validators/common'
import { listRemoteZimValidator } from '#validators/zim'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import type { HttpContext } from '@adonisjs/core/http'
import { createWriteStream } from 'fs'
import { rename } from 'fs/promises'
import { join, resolve, sep } from 'path'
import { ZIM_STORAGE_PATH, ensureDirectoryExists, sanitizeFilename } from '../utils/fs.js'

@inject()
export default class ZimController {
  constructor(private zimService: ZimService) {}

  async list({}: HttpContext) {
    return await this.zimService.list()
  }

  async listRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(listRemoteZimValidator)
    const { start = 0, count = 12, query } = payload
    return await this.zimService.listRemote({ start, count, query })
  }

  async downloadRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadWithMetadataValidator)
    assertNotPrivateUrl(payload.url)
    const { filename, jobId } = await this.zimService.downloadRemote(payload.url, payload.metadata)

    return {
      message: 'Download started successfully',
      filename,
      jobId,
      url: payload.url,
    }
  }

  async listCuratedCategories({}: HttpContext) {
    return await this.zimService.listCuratedCategories()
  }

  async downloadCategoryTier({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadCategoryTierValidator)
    const resources = await this.zimService.downloadCategoryTier(
      payload.categorySlug,
      payload.tierSlug
    )

    return {
      message: 'Download started successfully',
      categorySlug: payload.categorySlug,
      tierSlug: payload.tierSlug,
      resources,
    }
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameParamValidator)

    try {
      await this.zimService.delete(payload.params.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `ZIM file with key ${payload.params.filename} not found`,
        })
      }
      throw error // Re-throw any other errors and let the global error handler catch
    }

    return {
      message: 'ZIM file deleted successfully',
    }
  }

  async upload({ request, response }: HttpContext) {
    let filename: string | null = null
    let tmpPath: string | null = null
    let uploadError: string | null = null

    try {
      const basePath = resolve(join(process.cwd(), ZIM_STORAGE_PATH))
      await ensureDirectoryExists(basePath)

      request.multipart.onFile('*', {}, async (part) => {
        const clientName = part.filename || ''
        if (!clientName.toLowerCase().endsWith('.zim')) {
          part.resume()
          uploadError = 'INVALID_TYPE'
          return
        }

        const sanitized = sanitizeFilename(clientName)
        const finalPath = resolve(join(basePath, sanitized))

        if (!finalPath.startsWith(basePath + sep)) {
          part.resume()
          uploadError = 'INVALID_FILENAME'
          return
        }

        const { access } = await import('fs/promises')
        const exists = await access(finalPath).then(() => true).catch(() => false)
        if (exists) {
          part.resume()
          uploadError = 'DUPLICATE_FILENAME'
          return
        }

        filename = sanitized
        tmpPath = finalPath + '.tmp'
        const ws = createWriteStream(tmpPath)

        await new Promise<void>((res, rej) => {
          ws.on('error', rej)
          ws.on('finish', res)
          part.on('error', rej)
          part.pipe(ws)
        })

        await rename(tmpPath, finalPath)
        tmpPath = null
      })

      await request.multipart.process()

      if (uploadError === 'INVALID_TYPE') {
        return response.status(422).send({ message: 'Only .zim files are accepted' })
      }
      if (uploadError === 'INVALID_FILENAME') {
        return response.status(422).send({ message: 'Invalid filename' })
      }
      if (uploadError === 'DUPLICATE_FILENAME') {
        return response.status(409).send({ message: 'A ZIM file with that name already exists' })
      }
      if (!filename) {
        return response.status(400).send({ message: 'No file received' })
      }

      await this.zimService.registerLocalUpload(filename)

      return response.status(201).send({
        message: 'ZIM file uploaded and registered successfully',
        filename,
      })
    } catch (error) {
      logger.error('[ZimController] Upload failed:', error)
      if (tmpPath) {
        const { unlink } = await import('fs/promises')
        await unlink(tmpPath).catch(() => {})
      }
      return response.status(500).send({ message: 'Upload failed' })
    }
  }

  // Wikipedia selector endpoints

  async getWikipediaState({}: HttpContext) {
    return this.zimService.getWikipediaState()
  }

  async selectWikipedia({ request }: HttpContext) {
    const payload = await request.validateUsing(selectWikipediaValidator)
    return this.zimService.selectWikipedia(payload.optionId)
  }
}
