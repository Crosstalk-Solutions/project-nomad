import { RagService } from '#services/rag_service'
import { EmbedFileJob } from '#jobs/embed_file_job'
import KbRatioRegistry from '#models/kb_ratio_registry'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { randomBytes } from 'node:crypto'
import { sanitizeFilename } from '../utils/fs.js'
import { basename } from 'node:path'
import {
  deleteFileSchema,
  embedFileSchema,
  estimateBatchSchema,
  fileSourceSchema,
  getJobStatusSchema,
} from '#validators/rag'
import logger from '@adonisjs/core/services/logger'
import { sanitizeCollectionName } from '../../constants/kb_collections.js'

@inject()
export default class RagController {
  constructor(private ragService: RagService) {}

  public async upload({ request, response }: HttpContext) {
    const uploadedFile = request.file('file')
    if (!uploadedFile) {
      return response.status(400).json({ error: 'Nenhum arquivo foi enviado' })
    }

    const collection = sanitizeCollectionName(request.input('collection', null))

    const randomSuffix = randomBytes(6).toString('hex')
    const sanitizedName = sanitizeFilename(uploadedFile.clientName)

    const fileName = `${sanitizedName}-${randomSuffix}.${uploadedFile.extname || 'txt'}`
    const fullPath = app.makePath(RagService.UPLOADS_STORAGE_PATH, fileName)

    await uploadedFile.move(app.makePath(RagService.UPLOADS_STORAGE_PATH), {
      name: fileName,
    })

    // Envia a tarefa de geração de embeddings para execução em segundo plano.
    const result = await EmbedFileJob.dispatch({
      filePath: fullPath,
      fileName,
      ...(collection ? { collection } : {}),
    })

    return response.status(202).json({
      message: result.message,
      jobId: result.jobId,
      fileName,
      filePath: `/${RagService.UPLOADS_STORAGE_PATH}/${fileName}`,
      alreadyProcessing: !result.created,
      ...(collection ? { collection } : {}),
    })
  }

  public async getActiveJobs({ response }: HttpContext) {
    const jobs = await EmbedFileJob.listActiveJobs()
    return response.status(200).json(jobs)
  }

  public async getJobStatus({ request, response }: HttpContext) {
    const reqData = await request.validateUsing(getJobStatusSchema)

    const fullPath = app.makePath(RagService.UPLOADS_STORAGE_PATH, reqData.filePath)
    const status = await EmbedFileJob.getStatus(fullPath)

    if (!status.exists) {
      return response.status(404).json({ error: 'Nenhuma tarefa encontrada para este arquivo' })
    }

    return response.status(200).json(status)
  }

  public async getStoredFiles({ response }: HttpContext) {
    const files = await this.ragService.getStoredFiles()
    return response.status(200).json({ files })
  }

  public async getKnowledgeCollections({ response }: HttpContext) {
    const collections = await this.ragService.getKnowledgeCollections()
    return response.status(200).json({ collections })
  }

  public async updateFileCollection({ request, response }: HttpContext) {
    const source: string | null = request.input('source', null)

    // sanitizeCollectionName remove espaços nas extremidades, converte para
    // letras minúsculas, limita o tamanho e retorna null para entradas vazias.
    // Esse comportamento também permite remover a coleção e voltar para
    // a categoria "Não categorizado".
    const collection = sanitizeCollectionName(request.input('collection', null))

    if (!source) {
      return response.status(400).json({ error: 'O campo source é obrigatório.' })
    }

    const result = await this.ragService.updateFileCollection(source, collection)
    if (!result.success) {
      return response.status(500).json({ error: result.message })
    }
    return response.status(200).json({ message: result.message })
  }

  public async renameKnowledgeCollection({ request, response }: HttpContext) {
    const oldName = sanitizeCollectionName(request.input('oldName', null))
    const newName = sanitizeCollectionName(request.input('newName', null))

    if (!oldName || !newName) {
      return response.status(400).json({
        error: 'Os campos oldName e newName são obrigatórios.',
      })
    }

    const result = await this.ragService.renameKnowledgeCollection(oldName, newName)
    if (!result.success) {
      return response.status(500).json({ error: result.message })
    }
    return response.status(200).json({ message: result.message })
  }

  public async deleteKnowledgeCollection({ request, response }: HttpContext) {
    const name = sanitizeCollectionName(request.input('name', null))

    if (!name) {
      return response.status(400).json({ error: 'O campo name é obrigatório.' })
    }

    const result = await this.ragService.deleteKnowledgeCollection(name)
    if (!result.success) {
      return response.status(500).json({ error: result.message })
    }
    return response.status(200).json({ message: result.message })
  }

  public async getFileWarnings({ response }: HttpContext) {
    const result = await this.ragService.computeFileWarnings()
    return response.status(200).json(result)
  }

  public async deleteFile({ request, response }: HttpContext) {
    const { source } = await request.validateUsing(deleteFileSchema)
    const result = await this.ragService.deleteFileBySource(source)
    if (!result.success) {
      return response.status(500).json({ error: result.message })
    }
    return response.status(200).json({ message: result.message })
  }

  public async embedFile({ request, response }: HttpContext) {
    const { source, force } = await request.validateUsing(embedFileSchema)
    const result = await this.ragService.embedSingleFile(source, force ?? false)
    if (!result.success) {
      const status = {
        not_found: 404,
        inflight: 409,
        delete_failed: 500,
        dispatch_failed: 500,
      }[result.code]
      return response.status(status).json({ error: result.message, code: result.code })
    }
    return response.status(202).json({ message: result.message })
  }

  public async getFailedJobs({ response }: HttpContext) {
    const jobs = await EmbedFileJob.listFailedJobs()
    return response.status(200).json(jobs)
  }

  public async cleanupFailedJobs({ response }: HttpContext) {
    const result = await EmbedFileJob.cleanupFailedJobs()
    return response.status(200).json({
      message: `Limpeza concluída: ${result.cleaned} tarefa${result.cleaned !== 1 ? 's' : ''} com falha${result.filesDeleted > 0 ? `, ${result.filesDeleted} arquivo${result.filesDeleted !== 1 ? 's' : ''} excluído${result.filesDeleted !== 1 ? 's' : ''}` : ''}.`,
      ...result,
    })
  }

  public async cancelAllJobs({ response }: HttpContext) {
    const result = await EmbedFileJob.cancelAllJobs()
    return response.status(200).json({
      message: `${result.cancelled} tarefa${result.cancelled !== 1 ? 's' : ''} cancelada${result.cancelled !== 1 ? 's' : ''}${result.filesDeleted > 0 ? `, ${result.filesDeleted} arquivo${result.filesDeleted !== 1 ? 's' : ''} excluído${result.filesDeleted !== 1 ? 's' : ''}` : ''}.`,
      ...result,
    })
  }

  public async policyPromptState({ response }: HttpContext) {
    const result = await this.ragService.getPolicyPromptState()
    return response.status(200).json(result)
  }

  public async scanAndSync({ response }: HttpContext) {
    try {
      const syncResult = await this.ragService.scanAndSyncStorage()
      return response.status(200).json(syncResult)
    } catch (error) {
      logger.error({ err: error }, '[RagController] Erro ao verificar e sincronizar o armazenamento')
      return response.status(500).json({
        error: 'Erro ao verificar e sincronizar o armazenamento',
      })
    }
  }

  public async reembedAll({ response }: HttpContext) {
    try {
      const result = await this.ragService.reembedAll()
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, '[RagController] Erro ao gerar novamente os embeddings de todos os arquivos')
      return response.status(500).json({
        error: 'Erro ao gerar novamente os embeddings de todos os arquivos',
      })
    }
  }

  public async resetAndRebuild({ response }: HttpContext) {
    try {
      const result = await this.ragService.resetAndRebuild()
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, '[RagController] Erro ao redefinir e reconstruir os dados')
      return response.status(500).json({
        error: 'Erro ao redefinir e reconstruir os dados',
      })
    }
  }

  public async health({ response }: HttpContext) {
    const result = await this.ragService.checkQdrantHealth()
    return response.status(200).json(result)
  }

  public async estimateBatch({ request, response }: HttpContext) {
    const { files } = await request.validateUsing(estimateBatchSchema)

    // O registro identifica arquivos por prefixos do nome-base.
    // Se o chamador enviar um caminho completo (por exemplo,
    // /app/storage/zim/wikipedia_en_simple_…), remove os diretórios primeiro,
    // para que padrões como `wikipedia_en_simple_` continuem sendo reconhecidos.
    const normalized = files.map((f) => ({
      filename: basename(f.filename),
      sizeBytes: f.sizeBytes,
    }))
    const result = await KbRatioRegistry.estimateBatch(normalized)
    return response.status(200).json(result)
  }

  public async getFileContent({ request, response }: HttpContext) {
    const { source } = await request.validateUsing(fileSourceSchema)
    const result = await this.ragService.readFileContent(source)
    if (!result) {
      return response.status(404).json({
        error: 'Arquivo não encontrado ou não pode ser visualizado',
      })
    }
    return response.status(200).json(result)
  }

  public async downloadFile({ request, response }: HttpContext) {
    const { source } = await request.validateUsing(fileSourceSchema)
    const filePath = await this.ragService.resolveDownloadPath(source)
    if (!filePath) {
      return response.status(404).json({ error: 'Arquivo não encontrado' })
    }
    const fileName = filePath.split(/[/\\]/).at(-1) ?? 'download'
    return response.attachment(filePath, fileName)
  }
}
