import { cuid } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'

export default class RagsController {
  public async upload({ request, response }: HttpContext) {
    const uploadedFile = request.file('file')
    if (!uploadedFile) {
      return response.status(400).json({ error: 'No file uploaded' })
    }

    const fileName = `${cuid()}.${uploadedFile.extname}`

    await uploadedFile.move(app.makePath('storage/uploads'), {
      name: fileName,
    })
  }
}
