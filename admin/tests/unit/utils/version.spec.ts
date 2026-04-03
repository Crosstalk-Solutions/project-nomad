import { test } from '@japa/runner'
import { isNewerVersion, parseMajorVersion } from '../../../app/utils/version.js'

test.group('Utils | version', () => {
  test('parseMajorVersion: should extract the major version ignoring the v prefix', ({ assert }) => {
    assert.equal(parseMajorVersion('v3.8.1'), 3)
    assert.equal(parseMajorVersion('10.19.4'), 10)
    assert.equal(parseMajorVersion('invalid'), 0)
  })

  test('isNewerVersion: should compare standard versions correctly', ({ assert }) => {
    assert.isTrue(isNewerVersion('1.25.0', '1.24.0'))
    assert.isTrue(isNewerVersion('2.0.0', '1.9.9'))
    assert.isFalse(isNewerVersion('1.24.0', '1.25.0'))
    assert.isFalse(isNewerVersion('1.0.0', '1.0.0'))
  })

  test('isNewerVersion: should handle pre-release (RC) logic', ({ assert }) => {
    assert.isTrue(isNewerVersion('1.0.0', '1.0.0-rc.1', true))
    assert.isFalse(isNewerVersion('1.0.0-rc.1', '1.0.0', true))
    assert.isTrue(isNewerVersion('1.0.0-rc.2', '1.0.0-rc.1', true))
    assert.isFalse(isNewerVersion('1.0.0-rc.1', '1.0.0-rc.2', true))
  })

  test('isNewerVersion: should ignore pre-releases when includePreReleases is false', ({ assert }) => {
    assert.isFalse(isNewerVersion('1.0.1-rc.1', '1.0.0')) 
  })
})