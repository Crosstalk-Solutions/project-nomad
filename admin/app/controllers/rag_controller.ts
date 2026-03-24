import { RagService } from '#services/rag_service'
import { EmbedFileJob } from '#jobs/embed_file_job'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { randomBytes } from 'node:crypto'
import { sanitizeFilename } from '../utils/fs.js'
import { deleteFileSchema, getJobStatusSchema } from '#validators/rag'
import { apiError } from '../helpers/api_response.js'

@inject()
export default class RagController {
  constructor(private ragService: RagService) { }

  public async upload({ request, response }: HttpContext) {
    const uploadedFile = request.file('file', { size: '50mb' })
    if (!uploadedFile) {
      return response.status(400).json({ success: false, error: 'No file uploaded' })
    }

    if (!uploadedFile.isValid) {
      return response.status(422).json({ errors: uploadedFile.errors })
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
      success: true,
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
      return response.status(404).json({ success: false, error: 'Job not found for this file' })
    }

    return response.status(200).json(status)
  }

  public async getStoredFiles({ response }: HttpContext) {
    const files = await this.ragService.getStoredFiles()
    return response.status(200).json({ success: true, files })
  }

  public async deleteFile({ request, response }: HttpContext) {
    const { source } = await request.validateUsing(deleteFileSchema)
    const result = await this.ragService.deleteFileBySource(source)
    if (!result.success) {
      return response.status(500).json({ success: false, error: result.message })
    }
    return response.status(200).json({ success: true, message: result.message })
  }

  public async scanAndSync({ response }: HttpContext) {
    try {
      const syncResult = await this.ragService.scanAndSyncStorage()
      return response.status(200).json(syncResult)
    } catch (error) {
      return apiError(response, 500, 'Error scanning and syncing storage', error)
    }
  }
}
