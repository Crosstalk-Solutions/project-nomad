import { test } from '@japa/runner'
import KVStore from '../../../app/models/kv_store.js'

test.group('Models | KVStore (Mocked Database)', (group) => {
  let originalFindBy: any
  let originalFirstOrCreate: any

  group.each.setup(() => {
    // Save original database functions to restore later
    originalFindBy = KVStore.findBy
    originalFirstOrCreate = KVStore.firstOrCreate
  })

  group.each.teardown(() => {
    // Restore to avoid polluting other test suites
    KVStore.findBy = originalFindBy
    KVStore.firstOrCreate = originalFirstOrCreate
  })

  test('getValue: should return null when the key does not exist in the database', async ({ assert }) => {
    // Mock the database returning nothing
    KVStore.findBy = async () => null

    const result = await KVStore.getValue('system.updateAvailable' as any)
    assert.isNull(result)
  })

  test('clearValue: should set the value to null and invoke save() on the record', async ({ assert }) => {
    let saveCalled = false
    
    // Mock the record returned by the database
    const mockDbRecord = {
      value: 'old_configuration',
      save: async () => { saveCalled = true }
    }

    KVStore.findBy = async () => (mockDbRecord as any)

    await KVStore.clearValue('some_key' as any)

    assert.isNull(mockDbRecord.value)
    assert.isTrue(saveCalled) // Ensures the null value was persisted
  })
})