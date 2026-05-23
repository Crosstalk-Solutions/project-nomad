import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { assertNotCloudMetadataUrl } from '../../app/validators/common.js'

const expectBlocked = (url: string) => {
  assert.throws(() => assertNotCloudMetadataUrl(url), /instance metadata|http or https/)
}

const expectAllowed = (url: string) => {
  assert.doesNotThrow(() => assertNotCloudMetadataUrl(url))
}

test('blocks plain IPv4 IMDS', () => {
  expectBlocked('http://169.254.169.254/latest/meta-data/')
})

test('blocks IPv6 EC2 IMDS', () => {
  expectBlocked('http://[fd00:ec2::254]/')
})

test('blocks fully-expanded IPv6 EC2 IMDS', () => {
  expectBlocked('http://[fd00:ec2:0:0:0:0:0:254]/')
})

test('blocks IPv4-mapped IPv6 form of IMDS (dotted)', () => {
  expectBlocked('http://[::ffff:169.254.169.254]/')
})

test('blocks IPv4-mapped IPv6 form of IMDS (hex)', () => {
  expectBlocked('http://[::ffff:a9fe:a9fe]/')
})

test('blocks fully-expanded IPv4-mapped IPv6 form of IMDS', () => {
  expectBlocked('http://[0:0:0:0:0:ffff:a9fe:a9fe]/')
})

test('blocks non-http(s) schemes', () => {
  expectBlocked('file:///etc/passwd')
  expectBlocked('gopher://169.254.169.254/')
})

test('allows LAN / loopback / RFC1918 hosts (intentional for remote-ollama use case)', () => {
  expectAllowed('http://127.0.0.1:11434/')
  expectAllowed('http://192.168.1.10:11434/')
  expectAllowed('http://10.0.0.5:11434/')
  expectAllowed('http://[::1]:11434/')
})

test('allows DNS hostnames', () => {
  expectAllowed('http://ollama.lan:11434/')
  expectAllowed('https://api.example.com/v1')
})

test('allows other link-local IPv4 addresses (not the metadata IP)', () => {
  expectAllowed('http://169.254.1.1/')
})
