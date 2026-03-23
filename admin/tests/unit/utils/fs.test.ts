import { describe, it, expect } from 'vitest'
import { determineFileType, matchesDevice, sanitizeFilename } from '#app/utils/fs'

describe('determineFileType', () => {
  it('identifica arquivo JPG como image', () => {
    expect(determineFileType('photo.jpg')).toBe('image')
  })

  it('identifica arquivo PNG maiúsculo como image', () => {
    expect(determineFileType('photo.PNG')).toBe('image')
  })

  it('identifica arquivo PDF', () => {
    expect(determineFileType('doc.pdf')).toBe('pdf')
  })

  it('identifica arquivo Markdown como text', () => {
    expect(determineFileType('readme.md')).toBe('text')
  })

  it('identifica arquivo TXT como text', () => {
    expect(determineFileType('readme.txt')).toBe('text')
  })

  it('identifica arquivo ZIM', () => {
    expect(determineFileType('wiki.zim')).toBe('zim')
  })

  it('retorna unknown para extensão não reconhecida', () => {
    expect(determineFileType('archive.zip')).toBe('unknown')
  })
})

describe('matchesDevice', () => {
  it('corresponde dispositivo sda1 diretamente', () => {
    expect(matchesDevice('/dev/sda1', 'sda1')).toBe(true)
  })

  it('corresponde dispositivo nvme diretamente', () => {
    expect(matchesDevice('/dev/nvme0n1p1', 'nvme0n1p1')).toBe(true)
  })

  it('corresponde dispositivo LVM via device-mapper', () => {
    expect(matchesDevice('/dev/mapper/ubuntu--vg-ubuntu--lv', 'ubuntu--lv')).toBe(true)
  })

  it('não corresponde dispositivos diferentes', () => {
    expect(matchesDevice('/dev/sda1', 'sdb1')).toBe(false)
  })
})

describe('sanitizeFilename', () => {
  it('substitui espaços por underscores', () => {
    expect(sanitizeFilename('hello world.txt')).toBe('hello_world.txt')
  })

  it('substitui caracteres especiais por underscores', () => {
    expect(sanitizeFilename('file@#$.pdf')).toBe('file___.pdf')
  })

  it('mantém caracteres seguros inalterados', () => {
    expect(sanitizeFilename('safe-file_name.zip')).toBe('safe-file_name.zip')
  })
})
