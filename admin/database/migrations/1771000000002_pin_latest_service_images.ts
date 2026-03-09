import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.defer(async (db) => {
      // Pin :latest images to specific versions
      await db
        .from(this.tableName)
        .where('container_image', 'ghcr.io/gchq/cyberchef:latest')
        .update({ container_image: 'ghcr.io/gchq/cyberchef:10.19.4' })

      await db
        .from(this.tableName)
        .where('container_image', 'dullage/flatnotes:latest')
        .update({ container_image: 'dullage/flatnotes:v5.5.4' })

      await db
        .from(this.tableName)
        .where('container_image', 'treehouses/kolibri:latest')
        .update({ container_image: 'treehouses/kolibri:0.12.8' })

      // Populate source_repo for services whose images lack the OCI source label
      const sourceRepos: Record<string, string> = {
        nomad_kiwix_server: 'https://github.com/kiwix/kiwix-tools',
        nomad_ollama: 'https://github.com/ollama/ollama',
        nomad_qdrant: 'https://github.com/qdrant/qdrant',
        nomad_cyberchef: 'https://github.com/gchq/CyberChef',
        nomad_flatnotes: 'https://github.com/dullage/flatnotes',
        nomad_kolibri: 'https://github.com/learningequality/kolibri',
      }

      for (const [serviceName, repoUrl] of Object.entries(sourceRepos)) {
        await db
          .from(this.tableName)
          .where('service_name', serviceName)
          .update({ source_repo: repoUrl })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from(this.tableName)
        .where('container_image', 'ghcr.io/gchq/cyberchef:10.19.4')
        .update({ container_image: 'ghcr.io/gchq/cyberchef:latest' })

      await db
        .from(this.tableName)
        .where('container_image', 'dullage/flatnotes:v5.5.4')
        .update({ container_image: 'dullage/flatnotes:latest' })

      await db
        .from(this.tableName)
        .where('container_image', 'treehouses/kolibri:0.12.8')
        .update({ container_image: 'treehouses/kolibri:latest' })
    })
  }
}
