import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    // Update existing services with new friendly names and powered_by values
    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'Information Library',
        powered_by = 'Kiwix',
        display_order = 1,
        description = 'Offline access to Wikipedia, medical references, how-to guides, and encyclopedias'
      WHERE service_name = 'nomad_kiwix_serve'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'Education Platform',
        powered_by = 'Kolibri',
        display_order = 2,
        description = 'Interactive learning platform with video courses and exercises'
      WHERE service_name = 'nomad_kolibri'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'AI Assistant',
        powered_by = 'Open WebUI + Ollama',
        display_order = 3,
        description = 'Local AI chat that runs entirely on your hardware - no internet required'
      WHERE service_name = 'nomad_open_webui'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'Notes',
        powered_by = 'FlatNotes',
        display_order = 10,
        description = 'Simple note-taking app with local storage'
      WHERE service_name = 'nomad_flatnotes'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'Data Tools',
        powered_by = 'CyberChef',
        display_order = 11,
        description = 'Swiss Army knife for data encoding, encryption, and analysis'
      WHERE service_name = 'nomad_cyberchef'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        display_order = 100
      WHERE service_name = 'nomad_ollama'
    `)
  }

  async down() {
    // Revert to original names
    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'Kiwix',
        powered_by = NULL,
        display_order = NULL,
        description = 'Offline Wikipedia, eBooks, and more'
      WHERE service_name = 'nomad_kiwix_serve'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'Kolibri',
        powered_by = NULL,
        display_order = NULL,
        description = 'An offline-first education platform for schools and learners'
      WHERE service_name = 'nomad_kolibri'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'Open WebUI',
        powered_by = NULL,
        display_order = NULL,
        description = 'A web interface for interacting with local AI models served by Ollama'
      WHERE service_name = 'nomad_open_webui'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'FlatNotes',
        powered_by = NULL,
        display_order = NULL,
        description = 'A simple note-taking app that stores all files locally'
      WHERE service_name = 'nomad_flatnotes'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        friendly_name = 'CyberChef',
        powered_by = NULL,
        display_order = NULL,
        description = 'The Cyber Swiss Army Knife - a web app for encryption, encoding, and data analysis'
      WHERE service_name = 'nomad_cyberchef'
    `)

    await this.db.rawQuery(`
      UPDATE services SET
        display_order = NULL
      WHERE service_name = 'nomad_ollama'
    `)
  }
}
