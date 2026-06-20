import { RagService } from '#services/rag_service'
import { EmbedFileJob } from '#jobs/embed_file_job'
import KbRatioRegistry from '#models/kb_ratio_registry'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { randomBytes } from 'node:crypto'
import { sanitizeFilename } from '../utils/fs.js'
import { basename } from 'node:path'
import { deleteFileSchema, embedFileSchema, estimateBatchSchema, fileSourceSchema, getJobStatusSchema } from '#validators/rag'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class RagController {
  constructor(private ragService: RagService) { }

  public async upload({ request, response }: HttpContext) {
    const uploadedFile = request.file('file')
    if (!uploadedFile) {
      return response.status(400).json({ error: 'No file uploaded' })
    }

    const randomSuffix = randomBytes(6).toString('hex')
    const sanitizedName = sanitizeFilename(uploadedFile.clientName)

    const fileName = `${sanitizedName}-${randomSuffix}.${uploadedFile.extname || 'txt'}`
    const fullPath = app.makePath(RagService.UPLOADS_STORAGE_PATH, fileName)

    await uploadedFile.move(app.makePath(RagService.UPLOADS_STORAGE_PATH), {
      name: fileName,
    })

    // Dispatch background job for embedding
    const result = await EmbedFileJob.dispatch({
      filePath: fullPath,
      fileName,
    })

    return response.status(202).json({
      message: result.message,
      jobId: result.jobId,
      fileName,
      filePath: `/${RagService.UPLOADS_STORAGE_PATH}/${fileName}`,
      alreadyProcessing: !result.created,
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
      return response.status(404).json({ error: 'Job not found for this file' })
    }

    return response.status(200).json(status)
  }

  public async getStoredFiles({ response }: HttpContext) {
    const files = await this.ragService.getStoredFiles()
    return response.status(200).json({ files })
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
      message: `Cleaned up ${result.cleaned} failed job${result.cleaned !== 1 ? 's' : ''}${result.filesDeleted > 0 ? `, deleted ${result.filesDeleted} file${result.filesDeleted !== 1 ? 's' : ''}` : ''}.`,
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
      logger.error({ err: error }, '[RagController] Error scanning and syncing storage')
      return response.status(500).json({ error: 'Error scanning and syncing storage' })
    }
  }

  public async reembedAll({ response }: HttpContext) {
    try {
      const result = await this.ragService.reembedAll()
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, '[RagController] Error during re-embed all')
      return response.status(500).json({ error: 'Error during re-embed all' })
    }
  }

  public async resetAndRebuild({ response }: HttpContext) {
    try {
      const result = await this.ragService.resetAndRebuild()
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, '[RagController] Error during reset and rebuild')
      return response.status(500).json({ error: 'Error during reset and rebuild' })
    }
  }

  public async health({ response }: HttpContext) {
    const result = await this.ragService.checkQdrantHealth()
    return response.status(200).json(result)
  }

  public async estimateBatch({ request, response }: HttpContext) {
    const { files } = await request.validateUsing(estimateBatchSchema)
    // The registry matches on basename prefixes; if a caller passes a full path
    // (e.g. /app/storage/zim/wikipedia_en_simple_…), strip directories first so
    // patterns like `wikipedia_en_simple_` still match.
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
      return response.status(404).json({ error: 'File not found or not viewable' })
    }
    return response.status(200).json(result)
  }

  public async downloadFile({ request, response }: HttpContext) {
    const { source } = await request.validateUsing(fileSourceSchema)
    const filePath = await this.ragService.resolveDownloadPath(source)
    if (!filePath) {
      return response.status(404).json({ error: 'File not found' })
    }
    const fileName = filePath.split(/[/\\]/).at(-1) ?? 'download'
    return response.attachment(filePath, fileName)
  }
}
