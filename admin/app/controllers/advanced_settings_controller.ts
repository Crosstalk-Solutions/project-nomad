import Service from '#models/service'
import { SystemService } from '#services/system_service'
import { updateServiceUiLocationValidator } from '#validators/system'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class AdvancedSettingsController {
  constructor(private systemService: SystemService) {}

  async apps({ inertia }: HttpContext) {
    const services = await this.systemService.getServices({ installedOnly: false })
    return inertia.render('settings/advanced/apps', {
      system: {
        services,
      },
    })
  }

  async updateServiceUiLocation({ request, response, params }: HttpContext) {
    const id = Number.parseInt(String(params.id), 10)
    if (Number.isNaN(id)) {
      return response.status(400).send({ success: false, message: 'Invalid service id' })
    }

    const payload = await request.validateUsing(updateServiceUiLocationValidator)
    const service = await Service.query().where('id', id).first()

    if (!service) {
      return response.status(404).send({ success: false, message: 'Service not found' })
    }

    if (service.is_dependency_service) {
      return response.status(400).send({
        success: false,
        message: 'Cannot modify UI location for dependency services',
      })
    }

    service.ui_location = payload.ui_location
    await service.save()

    return response.send({ success: true, message: 'UI location updated' })
  }
}
