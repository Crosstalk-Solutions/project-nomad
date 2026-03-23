import { describe, it, expect } from 'vitest'
import { formatSpeed, toTitleCase, parseBoolean } from '#app/utils/misc'

describe('formatSpeed', () => {
  it('formata bytes por segundo', () => {
    // Cenário / Ação
    const resultado = formatSpeed(500)

    // Validação
    expect(resultado).toBe('500 B/s')
  })

  it('formata kilobytes por segundo', () => {
    // Cenário / Ação
    const resultado = formatSpeed(1024)

    // Validação
    expect(resultado).toBe('1.0 KB/s')
  })

  it('formata megabytes por segundo', () => {
    // Cenário / Ação
    const resultado = formatSpeed(1048576)

    // Validação
    expect(resultado).toBe('1.0 MB/s')
  })

  it('formata zero bytes por segundo', () => {
    // Cenário / Ação
    const resultado = formatSpeed(0)

    // Validação
    expect(resultado).toBe('0 B/s')
  })
})

describe('toTitleCase', () => {
  it('converte texto minúsculo para title case', () => {
    // Cenário / Ação
    const resultado = toTitleCase('hello world')

    // Validação
    expect(resultado).toBe('Hello World')
  })

  it('converte texto maiúsculo para title case', () => {
    // Cenário / Ação
    const resultado = toTitleCase('HELLO WORLD')

    // Validação
    expect(resultado).toBe('Hello World')
  })

  it('converte texto com caixa mista para title case', () => {
    // Cenário / Ação
    const resultado = toTitleCase('hELLO')

    // Validação
    expect(resultado).toBe('Hello')
  })
})

describe('parseBoolean', () => {
  it('retorna true para boolean true', () => {
    expect(parseBoolean(true)).toBe(true)
  })

  it('retorna false para boolean false', () => {
    expect(parseBoolean(false)).toBe(false)
  })

  it('retorna true para string "true"', () => {
    expect(parseBoolean('true')).toBe(true)
  })

  it('retorna false para string "false"', () => {
    expect(parseBoolean('false')).toBe(false)
  })

  it('retorna true para string "1"', () => {
    expect(parseBoolean('1')).toBe(true)
  })

  it('retorna false para string "0"', () => {
    expect(parseBoolean('0')).toBe(false)
  })

  it('retorna true para número 1', () => {
    expect(parseBoolean(1)).toBe(true)
  })

  it('retorna false para número 0', () => {
    expect(parseBoolean(0)).toBe(false)
  })

  it('retorna false para null', () => {
    expect(parseBoolean(null)).toBe(false)
  })

  it('retorna false para undefined', () => {
    expect(parseBoolean(undefined)).toBe(false)
  })
})
