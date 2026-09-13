import app from '@adonisjs/core/services/app'
import { BaseSchema } from '@adonisjs/lucid/schema'
import { NomadMdService } from '#services/nomad_md_service'
import { seedOpenHopNomadContext } from '#services/openhop_nomad_context'

export default class extends BaseSchema {
  async up() {
    this.defer(async () => {
      await seedOpenHopNomadContext(app.makePath(NomadMdService.STORAGE_PATH))
    })
  }

  async down() {
    // NOMAD.md belongs to the user. Never remove potentially edited instructions.
  }
}
