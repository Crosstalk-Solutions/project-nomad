import { test } from '@japa/runner'
import { determineFileType, sanitizeFilename, matchesDevice } from '../../../app/utils/fs.js'

test.group('Utils | fs (pure functions)', () => {
  test('determineFileType: should classify the file by extension case-insensitively', ({ assert }) => {
    assert.equal(determineFileType('document.pdf'), 'pdf')
    assert.equal(determineFileType('image.JPG'), 'image') 
    assert.equal(determineFileType('library.zim'), 'zim')
    assert.equal(determineFileType('notes.md'), 'text')
    assert.equal(determineFileType('unknown_file.xyz'), 'unknown')
  })

  test('sanitizeFilename: should replace dangerous characters with underscore', ({ assert }) => {
    assert.equal(sanitizeFilename('my file!.txt'), 'my_file_.txt')
    assert.equal(sanitizeFilename('../hidden/file.txt'), '.._hidden_file.txt')
    assert.equal(sanitizeFilename('safe-file_name.123.pdf'), 'safe-file_name.123.pdf')
  })

  test('matchesDevice: should match system paths with block device names', ({ assert }) => {
    assert.isTrue(matchesDevice('/dev/sda1', 'sda1'))
    assert.isTrue(matchesDevice('/dev/mapper/ubuntu--vg-ubuntu--lv', 'ubuntu--lv'))
    assert.isFalse(matchesDevice('/dev/sda1', 'sdb1'))
  })
})