import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'drug_labels'

  async up() {
    await this.db.rawQuery(
      'ALTER TABLE drug_labels MODIFY COLUMN ingested_at timestamp NOT NULL ' +
        'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    )
  }

  async down() {
    await this.db.rawQuery('ALTER TABLE drug_labels MODIFY COLUMN ingested_at timestamp NOT NULL')
  }
}
