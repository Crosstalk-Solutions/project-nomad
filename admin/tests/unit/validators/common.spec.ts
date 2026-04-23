import { test } from '@japa/runner'

import { assertNotPrivateUrl } from '#validators/common'

test.group('assertNotPrivateUrl', () => {
  test('rejects loopback and link-local endpoints', ({ assert }) => {
    const blocked = [
      'http://localhost:3000/file.zim',
      'http://127.0.0.1:8080/file.zim',
      'http://169.254.169.254/latest/meta-data',
      'http://[fe80::1]/file.zim',
    ]

    for (const url of blocked) {
      assert.throws(() => assertNotPrivateUrl(url), 'Download URL must not point to a loopback or link-local address')
    }
  })

  test('allows LAN and public hosts', ({ assert }) => {
    const allowed = [
      'http://192.168.1.8:8080/file.zim',
      'http://my-nas:8080/file.zim',
      'https://downloads.example.com/archive.zim',
    ]

    for (const url of allowed) {
      assert.doesNotThrow(() => assertNotPrivateUrl(url))
    }
  })
})
