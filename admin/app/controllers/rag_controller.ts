import { RagService } from '#services/rag_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { randomBytes } from 'node:crypto'
import { sanitizeFilename } from '../utils/fs.js'

@inject()
export default class RagController {
  constructor(private ragService: RagService) {}

  public async upload({ request, response }: HttpContext) {
    const uploadedFile = request.file('file')
    if (!uploadedFile) {
      return response.status(400).json({ error: 'No file uploaded' })
    }

    const randomSuffix = randomBytes(6).toString('hex')
    const sanitizedName = sanitizeFilename(uploadedFile.clientName)

    const fileName = `${sanitizedName}-${randomSuffix}.${uploadedFile.extname || 'txt'}`
    const fullPath = app.makePath('storage/uploads', fileName)

    await uploadedFile.move(app.makePath('storage/uploads'), {
      name: fileName,
    })

    // Don't await this - process in background
    this.ragService.processAndEmbedFile(fullPath)

    return response.status(200).json({
      message: 'File has been uploaded and queued for processing.',
      file_path: `/uploads/${fileName}`,
    })
  }

  public async getStoredFiles({ response }: HttpContext) {
    const files = await this.ragService.getStoredFiles()
    return response.status(200).json({ files })
  }
}
