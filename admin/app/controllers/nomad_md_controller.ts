import { NomadMdService } from '#services/nomad_md_service'
import { updateNomadMdSchema } from '#validators/nomad_md'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class NomadMdController {
  constructor(private nomadMdService: NomadMdService) {}

  async show({ response }: HttpContext) {
    const content = await this.nomadMdService.read()
    return response.status(200).json({ content })
  }

  async update({ request, response }: HttpContext) {
    const { content } = await request.validateUsing(updateNomadMdSchema)
    // Empty request strings arrive as undefined (AdonisJS null-coerces them);
    // treat that as an explicit "clear the file".
    await this.nomadMdService.write(content ?? '')
    return response.status(200).json({ success: true, message: 'NOMAD.md saved successfully' })
  }
}
