import { EmbedFileJob } from '#jobs/embed_file_job'
import { LocalLibraryService } from '#services/local_library_service'
import {
  localLibraryFilenameValidator,
  localLibraryRenameValidator,
} from '#validators/local_library'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class LocalLibraryController {
  constructor(private localLibraryService: LocalLibraryService) {}

  async page({ inertia }: HttpContext) {
    return inertia.render('local-library')
  }

  async list({ response }: HttpContext) {
    return response.status(200).json({ files: await this.localLibraryService.list() })
  }

  async upload({ request, response }: HttpContext) {
    const uploadedFile = request.file('file')
    if (!uploadedFile) return response.status(400).json({ message: 'No file uploaded' })

    try {
      await this.localLibraryService.ensureStorage()
      const name = this.localLibraryService.sanitizeUploadName(uploadedFile.clientName)
      await uploadedFile.move(this.localLibraryService.getStoragePath(), { name, overwrite: true })
      return response
        .status(201)
        .json({ message: 'File uploaded', files: await this.localLibraryService.list() })
    } catch (error: any) {
      if (error.message === 'unsupported_file_type') {
        return response.status(400).json({ message: 'Unsupported library file type' })
      }
      if (error.message === 'invalid_filename') {
        return response.status(400).json({ message: 'Invalid filename' })
      }
      throw error
    }
  }

  async view({ request, response }: HttpContext) {
    const payload = await request.validateUsing(localLibraryFilenameValidator)
    try {
      const file = await this.localLibraryService.stream(payload.params.filename)
      response.header('Content-Type', file.contentType)
      response.header('Content-Length', String(file.size))
      response.header(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.filename)}"`
      )
      return response.stream(file.stream)
    } catch (error: any) {
      if (['not_found', 'invalid_filename'].includes(error.message)) {
        return response.status(404).json({ message: 'File not found' })
      }
      throw error
    }
  }

  async download({ request, response }: HttpContext) {
    const payload = await request.validateUsing(localLibraryFilenameValidator)
    try {
      const file = await this.localLibraryService.stream(payload.params.filename)
      response.header('Content-Type', file.contentType)
      response.header('Content-Length', String(file.size))
      response.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.filename)}"`
      )
      return response.stream(file.stream)
    } catch (error: any) {
      if (['not_found', 'invalid_filename'].includes(error.message)) {
        return response.status(404).json({ message: 'File not found' })
      }
      throw error
    }
  }

  async preview({ request, response }: HttpContext) {
    const payload = await request.validateUsing(localLibraryFilenameValidator)
    try {
      return response
        .status(200)
        .json(await this.localLibraryService.preview(payload.params.filename))
    } catch (error: any) {
      if (error.message === 'preview_unsupported') {
        return response.status(415).json({ message: 'Preview is not supported for this file type' })
      }
      if (['not_found', 'invalid_filename'].includes(error.message)) {
        return response.status(404).json({ message: 'File not found' })
      }
      throw error
    }
  }

  async rename({ request, response }: HttpContext) {
    const payload = await request.validateUsing(localLibraryRenameValidator)
    try {
      return response.status(200).json({
        file: await this.localLibraryService.rename(payload.params.filename, payload.name),
      })
    } catch (error: any) {
      if (['not_found', 'invalid_filename'].includes(error.message)) {
        return response.status(404).json({ message: 'File not found' })
      }
      if (error.message === 'unsupported_file_type') {
        return response.status(400).json({ message: 'Unsupported library file type' })
      }
      throw error
    }
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(localLibraryFilenameValidator)
    try {
      await this.localLibraryService.remove(payload.params.filename)
      return response.status(200).json({ message: 'File deleted' })
    } catch (error: any) {
      if (['not_found', 'invalid_filename'].includes(error.message) || error.code === 'ENOENT') {
        return response.status(404).json({ message: 'File not found' })
      }
      throw error
    }
  }

  async index({ request, response }: HttpContext) {
    const payload = await request.validateUsing(localLibraryFilenameValidator)
    try {
      const file = await this.localLibraryService.stream(payload.params.filename)
      const result = await EmbedFileJob.dispatch({
        filePath: file.fullPath,
        fileName: file.filename,
        fileSize: file.size,
      })
      return response.status(202).json({
        message: result.message,
        jobId: result.jobId,
        alreadyProcessing: !result.created,
      })
    } catch (error: any) {
      if (['not_found', 'invalid_filename'].includes(error.message)) {
        return response.status(404).json({ message: 'File not found' })
      }
      throw error
    }
  }
}
