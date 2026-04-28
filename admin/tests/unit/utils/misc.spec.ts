import { test } from '@japa/runner'
import { formatSpeed, toTitleCase, parseBoolean } from '../../../app/utils/misc.js'

test.group('Utils | misc', () => {
  test('formatSpeed: should format bytes correctly', ({ assert }) => {
    assert.equal(formatSpeed(500), '500 B/s')
    assert.equal(formatSpeed(1024), '1.0 KB/s')
    assert.equal(formatSpeed(1536), '1.5 KB/s')
    assert.equal(formatSpeed(1048576), '1.0 MB/s')
  })

  test('toTitleCase: should capitalize the first letter of each word', ({ assert }) => {
    assert.equal(toTitleCase('hello world'), 'Hello World')
    assert.equal(toTitleCase('PROJECT NOMAD'), 'Project Nomad')
    assert.equal(toTitleCase('cOMmAnD cEnTeR'), 'Command Center')
  })

  test('parseBoolean: should convert various types to boolean', ({ assert }) => {
    assert.isTrue(parseBoolean(true))
    assert.isTrue(parseBoolean('true'))
    assert.isTrue(parseBoolean('1'))
    assert.isTrue(parseBoolean(1))

    assert.isFalse(parseBoolean(false))
    assert.isFalse(parseBoolean('false'))
    assert.isFalse(parseBoolean('0'))
    assert.isFalse(parseBoolean(0))
    assert.isFalse(parseBoolean(null))
    assert.isFalse(parseBoolean(undefined))
  })
})