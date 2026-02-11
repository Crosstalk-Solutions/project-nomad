import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.dropTableIfExists('curated_collection_resources')
    this.schema.dropTableIfExists('curated_collections')
    this.schema.dropTableIfExists('zim_file_metadata')
  }

  async down() {
    // These tables are legacy and intentionally not recreated
  }
}
