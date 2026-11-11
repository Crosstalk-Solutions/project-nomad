import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNewerVersion, isValidReleaseTag } from '../../app/utils/version.js'

test('prerelease label is compared before the number', () => {
  assert.equal(isNewerVersion('1.36.0-rc.1', '1.36.0-beta.2', true), true)
  assert.equal(isNewerVersion('1.36.0-beta.2', '1.36.0-rc.1', true), false)
})

test('same label compares numerically', () => {
  assert.equal(isNewerVersion('1.36.0-rc.10', '1.36.0-rc.2', true), true)
  assert.equal(isNewerVersion('1.36.0-rc.2', '1.36.0-rc.10', true), false)
  assert.equal(isNewerVersion('1.36.0-rc.1', '1.36.0-rc.1', true), false)
})

test('more identifiers wins when the prefix is equal; GA beats prerelease', () => {
  assert.equal(isNewerVersion('1.36.0-rc.1', '1.36.0-rc', true), true)
  assert.equal(isNewerVersion('1.36.0', '1.36.0-rc.1'), true)
  assert.equal(isNewerVersion('1.36.0-rc.1', '1.36.0', true), false)
  assert.equal(isNewerVersion('v1.37.0', '1.36.9'), true)
})

test('isValidReleaseTag accepts release tags and rejects anything else', () => {
  for (const ok of ['1.2.3', 'v1.2.3', 'v1.36.0-rc.1', 'latest', '1.0.0-beta-2']) {
    assert.equal(isValidReleaseTag(ok), true, ok)
  }
  for (const bad of ['', 'v1.2', '1.2.3|x', '1.2.3\nfoo', 'latest; rm -rf /', '1.2.3-', '../x']) {
    assert.equal(isValidReleaseTag(bad), false, JSON.stringify(bad))
  }
})
