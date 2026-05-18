import { test } from '@japa/runner'

import { assertNotPrivateUrl } from '#validators/common'

test.group('assertNotPrivateUrl', () => {
  test('rejects loopback and link-local hosts', ({ assert }) => {
    for (const url of [
      'http://localhost/file.zim',
      'http://127.0.0.1/file.zim',
      'http://0.0.0.0/file.zim',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/file.zim',
      'http://[fe80::1]/file.zim',
      'http://[::ffff:7f00:1]/file.zim',
      'http://[::]/file.zim',
    ]) {
      assert.throws(
        () => assertNotPrivateUrl(url),
        /Download URL must not point to a loopback or link-local address/
      )
    }
  })

  test('rejects localhost with trailing root dots', ({ assert }) => {
    for (const url of ['http://localhost./file.zim', 'http://LOCALHOST./file.zim']) {
      assert.throws(
        () => assertNotPrivateUrl(url),
        /Download URL must not point to a loopback or link-local address/
      )
    }
  })

  test('allows public and LAN hosts', ({ assert }) => {
    for (const url of [
      'https://example.com/file.zim',
      'http://my-nas:8080/file.zim',
      'http://192.168.1.10/file.zim',
      'http://10.0.0.5/file.zim',
      'http://172.16.0.10/file.zim',
    ]) {
      assert.doesNotThrow(() => assertNotPrivateUrl(url))
    }
  })
})
