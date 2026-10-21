
import { ZimService } from '#services/zim_service'
import {
  assertNotPrivateUrl,
  downloadCategoryTierValidator,
  filenameParamValidator,
  remoteDownloadWithMetadataValidator,
  selectWikipediaValidator,
} from '#validators/common'
import { addCustomLibraryValidator, browseLibraryValidator, idParamValidator, listRemoteZimValidator } from '#validators/zim'
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
      message: 'Download iniciado com sucesso',
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
      message: 'Download iniciado com sucesso',
      categorySlug: payload.categorySlug,
      tierSlug: payload.tierSlug,
      resources,
    }
  }

  async rescanLibrary({}: HttpContext) {
    const result = await this.zimService.rescanLibrary()
    return {
      message: 'Biblioteca Kiwix reexaminada',
      ...result,
    }
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameParamValidator)

    try {
      await this.zimService.delete(payload.params.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `Arquivo ZIM com a chave ${payload.params.filename} não encontrado`,
        })
      }
      throw error // Relança os demais erros para que o manipulador global de erros os trate
    }

    return {
      message: 'Arquivo ZIM excluído com sucesso',
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
        return response.status(422).send({ message: 'Somente arquivos .zim são aceitos' })
      }
      if (uploadError === 'INVALID_FILENAME') {
        return response.status(422).send({ message: 'Nome de arquivo inválido' })
      }
      if (uploadError === 'DUPLICATE_FILENAME') {
        return response.status(409).send({ message: 'Já existe um arquivo ZIM com esse nome' })
      }
      if (!filename) {
        return response.status(400).send({ message: 'Nenhum arquivo foi recebido' })
      }

      const { added } = await this.zimService.registerLocalUpload(filename)

      return response.status(201).send({
        message: 'Arquivo ZIM enviado e registrado com sucesso',
        filename,
        added,
      })
    } catch (error) {
      logger.error('[ZimController] Falha no envio do arquivo:', error)
      if (tmpPath) {
        const { unlink } = await import('fs/promises')
        await unlink(tmpPath).catch(() => {})
      }
      return response.status(500).send({ message: 'Falha no envio do arquivo' })
    }
  }

  // Endpoints do seletor da Wikipédia

  async getWikipediaState({}: HttpContext) {
    return this.zimService.getWikipediaState()
  }

  async selectWikipedia({ request }: HttpContext) {
    const payload = await request.validateUsing(selectWikipediaValidator)
    return this.zimService.selectWikipedia(payload.optionId)
  }

  // Endpoints de bibliotecas personalizadas

  async listCustomLibraries({}: HttpContext) {
    return this.zimService.listCustomLibraries()
  }

  async addCustomLibrary({ request, response }: HttpContext) {
    const payload = await request.validateUsing(addCustomLibraryValidator)
    assertNotPrivateUrl(payload.base_url)
    try {
      const source = await this.zimService.addCustomLibrary(payload.name, payload.base_url)
      return { message: 'Biblioteca personalizada adicionada', library: source }
    } catch (error) {
      if (error.message === 'Maximum of 10 custom libraries allowed') {
        return response.status(400).send({ message: 'O limite máximo é de 10 bibliotecas personalizadas' })
      }
      throw error
    }
  }

  async removeCustomLibrary({ request, response }: HttpContext) {
    const payload = await request.validateUsing(idParamValidator)
    try {
      await this.zimService.removeCustomLibrary(payload.params.id)
      return { message: 'Biblioteca personalizada removida' }
    } catch (error) {
      if (error.message === 'Custom library not found') {
        return response.status(404).send({ message: 'Biblioteca personalizada não encontrada' })
      }
      throw error
    }
  }

  async browseLibrary({ request, response }: HttpContext) {
    const payload = await request.validateUsing(browseLibraryValidator)
    try {
      return await this.zimService.browseLibraryUrl(payload.url)
    } catch (error) {
      if (error.message?.includes('loopback or link-local')) {
        return response.status(400).send({ message: error.message })
      }
      return response.status(502).send({
        message: 'Não foi possível obter a listagem de diretórios da URL fornecida',
      })
    }
  }
}
