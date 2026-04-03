import { test } from '@japa/runner'
import { assertNotPrivateUrl } from '../../../app/validators/common.js'

test.group('Validators | common | SSRF Protection', () => {
  test('assertNotPrivateUrl: should block loopback addresses', ({ assert }) => {
    assert.throws(() => assertNotPrivateUrl('http://localhost:8080/file.zim'))
    assert.throws(() => assertNotPrivateUrl('http://127.0.0.1/api'))
    assert.throws(() => assertNotPrivateUrl('http://0.0.0.0/test'))
    assert.throws(() => assertNotPrivateUrl('http://[::1]/'))
  })

  test('assertNotPrivateUrl: should block link-local and cloud metadata addresses', ({ assert }) => {
    assert.throws(() => assertNotPrivateUrl('http://169.254.169.254/latest/meta-data/'))
    assert.throws(() => assertNotPrivateUrl('http://fe80::1ff:fe23:4567:890a/'))
  })

  test('assertNotPrivateUrl: should allow local network IP addresses (RFC1918)', ({ assert }) => {
    assert.doesNotThrow(() => assertNotPrivateUrl('http://192.168.1.100:8080/file.zim'))
    assert.doesNotThrow(() => assertNotPrivateUrl('http://10.0.0.5/data'))
    assert.doesNotThrow(() => assertNotPrivateUrl('http://172.16.0.10/'))
  })

  test('assertNotPrivateUrl: should allow normal external domains', ({ assert }) => {
    assert.doesNotThrow(() => assertNotPrivateUrl('https://download.kiwix.org/zim/wikipedia.zim'))
    assert.doesNotThrow(() => assertNotPrivateUrl('http://meu-nas-local:8080/file'))
  })
})