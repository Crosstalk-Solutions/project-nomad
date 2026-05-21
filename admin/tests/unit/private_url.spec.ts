import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { assertNotPrivateUrl } from '../../app/validators/common.js'

const expectBlocked = (url: string) => {
  assert.throws(() => assertNotPrivateUrl(url), /loopback or link-local/)
}

const expectAllowed = (url: string) => {
  assert.doesNotThrow(() => assertNotPrivateUrl(url))
}

test('blocks loopback and unspecified IPv4 literals', () => {
  expectBlocked('http://127.0.0.1/file.zim')
  expectBlocked('http://0177.0.0.1/file.zim')
  expectBlocked('http://2130706433/file.zim')
  expectBlocked('http://0.0.0.0/file.zim')
  expectBlocked('http://0/file.zim')
})

test('blocks link-local IPv4 literals including cloud metadata', () => {
  expectBlocked('http://169.254.169.254/latest/meta-data/')
  expectBlocked('http://169.254.1.1/file.zim')
})

test('blocks IPv6 loopback, link-local, unspecified, and mapped loopback literals', () => {
  expectBlocked('http://[::1]/file.zim')
  expectBlocked('http://[fe80::1]/file.zim')
  expectBlocked('http://[::]/file.zim')
  expectBlocked('http://[::ffff:127.0.0.1]/file.zim')
})

test('allows RFC1918 LAN literals and DNS names for NOMAD LAN appliances', () => {
  expectAllowed('http://10.0.0.2/file.zim')
  expectAllowed('http://172.16.0.2/file.zim')
  expectAllowed('http://192.168.1.10/file.zim')
  expectAllowed('http://my-nas.local/file.zim')
})
