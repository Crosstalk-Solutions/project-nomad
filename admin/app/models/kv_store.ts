import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { KVStoreKey, KVStoreValue } from '../../types/kv_store.js'

/**
 * Generic key-value store model for storing various settings
 * that don't necessitate their own dedicated models.
 */
export default class KVStore extends BaseModel {
  static table = 'kv_store'
  static namingStrategy = new SnakeCaseNamingStrategy()

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare key: KVStoreKey

  @column()
  declare value: KVStoreValue

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  /**
   * Get a setting value by key
   */
  static async getValue(key: KVStoreKey): Promise<KVStoreValue> {
    const setting = await this.findBy('key', key)
    if (!setting || setting.value === undefined || setting.value === null) {
      return null
    }
    if (typeof setting.value === 'string') {
      return setting.value
    }
    return String(setting.value)
  }

  /**
   * Set a setting value by key (creates if not exists)
   */
  static async setValue(key: KVStoreKey, value: KVStoreValue): Promise<KVStore> {
    const setting = await this.firstOrCreate({ key }, { key, value })
    if (setting.value !== value) {
      setting.value = value
      await setting.save()
    }
    return setting
  }
}
