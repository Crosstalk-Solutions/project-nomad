import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { BenchmarkSettingKey } from '../../types/benchmark.js'
import { isDuplicateKeyError } from '../utils/sql.js'

export default class BenchmarkSetting extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare key: BenchmarkSettingKey

  @column()
  declare value: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  /**
   * Get a setting value by key
   */
  static async getValue(key: BenchmarkSettingKey): Promise<string | null> {
    const setting = await this.findBy('key', key)
    return setting?.value ?? null
  }

  /**
   * Set a setting value by key (creates if not exists)
   */
  static async setValue(key: BenchmarkSettingKey, value: string | null): Promise<BenchmarkSetting> {
    try {
      return await this.updateOrCreate({ key }, { value })
    } catch (err) {
      // Concurrent first write won the INSERT; the retry takes the update path.
      if (!isDuplicateKeyError(err)) throw err
      return await this.updateOrCreate({ key }, { value })
    }
  }

  /**
   * Get all benchmark settings as a typed object
   */
  static async getAllSettings(): Promise<{
    allow_anonymous_submission: boolean
    installation_id: string | null
    last_benchmark_run: string | null
  }> {
    const settings = await this.all()
    const map = new Map(settings.map((s) => [s.key, s.value]))

    return {
      allow_anonymous_submission: map.get('allow_anonymous_submission') === 'true',
      installation_id: map.get('installation_id') ?? null,
      last_benchmark_run: map.get('last_benchmark_run') ?? null,
    }
  }
}
