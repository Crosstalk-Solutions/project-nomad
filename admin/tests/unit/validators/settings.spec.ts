import { test } from '@japa/runner'
import { updateSettingSchema } from '../../../app/validators/settings.js'
import { SETTINGS_KEYS } from '../../../constants/kv_store.js'

test.group('Validators | settings', () => {
  test('updateSettingSchema: should validate using a valid system key', async ({ assert }) => {
    const validKey = SETTINGS_KEYS[0] 
    await assert.doesNotReject(() => updateSettingSchema.validate({ key: validKey, value: 'some value' }))
    await assert.doesNotReject(() => updateSettingSchema.validate({ key: validKey })) 
  })

  test('updateSettingSchema: should fail with an invalid key', async ({ assert }) => {
    await assert.rejects(() => updateSettingSchema.validate({ key: 'INVALID_KEY', value: '123' }))
  })
})