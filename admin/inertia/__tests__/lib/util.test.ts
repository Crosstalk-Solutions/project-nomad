import { describe, it, expect } from 'vitest'
import { capitalizeFirstLetter, formatBytes, extractFileName, generateRandomString } from '~/lib/util'

describe('capitalizeFirstLetter', () => {
  it('deve capitalizar a primeira letra de uma string', () => {
    // Cenário
    const entrada = 'hello'

    // Ação
    const resultado = capitalizeFirstLetter(entrada)

    // Validação
    expect(resultado).toBe('Hello')
  })

  it('deve retornar string vazia para entrada vazia', () => {
    // Cenário
    const entrada = ''

    // Ação
    const resultado = capitalizeFirstLetter(entrada)

    // Validação
    expect(resultado).toBe('')
  })

  it('deve retornar string vazia para null', () => {
    // Cenário
    const entrada = null

    // Ação
    const resultado = capitalizeFirstLetter(entrada)

    // Validação
    expect(resultado).toBe('')
  })

  it('deve retornar string vazia para undefined', () => {
    // Cenário
    const entrada = undefined

    // Ação
    const resultado = capitalizeFirstLetter(entrada)

    // Validação
    expect(resultado).toBe('')
  })
})

describe('formatBytes', () => {
  it('deve retornar "0 Bytes" para 0 bytes', () => {
    // Cenário
    const bytes = 0

    // Ação
    const resultado = formatBytes(bytes)

    // Validação
    expect(resultado).toBe('0 Bytes')
  })

  it('deve formatar 1024 bytes como "1 KB"', () => {
    // Cenário
    const bytes = 1024

    // Ação
    const resultado = formatBytes(bytes)

    // Validação
    expect(resultado).toBe('1 KB')
  })

  it('deve formatar 1048576 bytes como "1 MB"', () => {
    // Cenário
    const bytes = 1048576

    // Ação
    const resultado = formatBytes(bytes)

    // Validação
    expect(resultado).toBe('1 MB')
  })

  it('deve formatar 1073741824 bytes como "1 GB"', () => {
    // Cenário
    const bytes = 1073741824

    // Ação
    const resultado = formatBytes(bytes)

    // Validação
    expect(resultado).toBe('1 GB')
  })

  it('deve formatar 500 bytes como "500 Bytes"', () => {
    // Cenário
    const bytes = 500

    // Ação
    const resultado = formatBytes(bytes)

    // Validação
    expect(resultado).toBe('500 Bytes')
  })
})

describe('extractFileName', () => {
  it('deve extrair nome do arquivo de caminho Unix', () => {
    // Cenário
    const caminho = '/home/user/file.txt'

    // Ação
    const resultado = extractFileName(caminho)

    // Validação
    expect(resultado).toBe('file.txt')
  })

  it('deve extrair nome do arquivo de caminho Windows', () => {
    // Cenário
    const caminho = 'C:\\Users\\file.txt'

    // Ação
    const resultado = extractFileName(caminho)

    // Validação
    expect(resultado).toBe('file.txt')
  })

  it('deve retornar o próprio nome quando não há caminho', () => {
    // Cenário
    const caminho = 'file.txt'

    // Ação
    const resultado = extractFileName(caminho)

    // Validação
    expect(resultado).toBe('file.txt')
  })

  it('deve retornar string vazia para entrada vazia', () => {
    // Cenário
    const caminho = ''

    // Ação
    const resultado = extractFileName(caminho)

    // Validação
    expect(resultado).toBe('')
  })
})

describe('generateRandomString', () => {
  it('deve gerar string com o tamanho especificado', () => {
    // Cenário
    const tamanho = 10

    // Ação
    const resultado = generateRandomString(tamanho)

    // Validação
    expect(resultado).toHaveLength(10)
  })

  it('deve retornar string vazia para tamanho 0', () => {
    // Cenário
    const tamanho = 0

    // Ação
    const resultado = generateRandomString(tamanho)

    // Validação
    expect(resultado).toBe('')
  })

  it('deve conter apenas caracteres alfanuméricos', () => {
    // Cenário
    const tamanho = 100

    // Ação
    const resultado = generateRandomString(tamanho)

    // Validação
    expect(resultado).toMatch(/^[A-Za-z0-9]+$/)
  })
})
