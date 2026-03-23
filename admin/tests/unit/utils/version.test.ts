import { describe, it, expect } from 'vitest'
import { isNewerVersion, parseMajorVersion } from '#app/utils/version'

describe('isNewerVersion', () => {
  it('retorna true quando major é maior', () => {
    // Cenário
    const v1 = '2.0.0'
    const v2 = '1.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(true)
  })

  it('retorna true quando minor é maior', () => {
    // Cenário
    const v1 = '1.1.0'
    const v2 = '1.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(true)
  })

  it('retorna true quando patch é maior', () => {
    // Cenário
    const v1 = '1.0.1'
    const v2 = '1.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(true)
  })

  it('retorna false quando major é menor', () => {
    // Cenário
    const v1 = '1.0.0'
    const v2 = '2.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(false)
  })

  it('retorna false quando versões são iguais', () => {
    // Cenário
    const v1 = '1.0.0'
    const v2 = '1.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(false)
  })

  it('retorna true com prefixo v', () => {
    // Cenário
    const v1 = 'v2.0.0'
    const v2 = 'v1.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(true)
  })

  it('retorna false para pre-release sem flag includePreReleases', () => {
    // Cenário
    const v1 = '2.0.0-rc.1'
    const v2 = '1.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(false)
  })

  it('retorna true para pre-release com flag includePreReleases', () => {
    // Cenário
    const v1 = '2.0.0-rc.1'
    const v2 = '1.0.0'

    // Ação
    const resultado = isNewerVersion(v1, v2, true)

    // Validação
    expect(resultado).toBe(true)
  })

  it('retorna true quando GA é comparado com RC da mesma versão', () => {
    // Cenário
    const v1 = '1.0.0'
    const v2 = '1.0.0-rc.1'

    // Ação
    const resultado = isNewerVersion(v1, v2)

    // Validação
    expect(resultado).toBe(true)
  })

  it('retorna true quando RC maior é comparado com RC menor', () => {
    // Cenário
    const v1 = '1.0.0-rc.2'
    const v2 = '1.0.0-rc.1'

    // Ação
    const resultado = isNewerVersion(v1, v2, true)

    // Validação
    expect(resultado).toBe(true)
  })
})

describe('parseMajorVersion', () => {
  it('extrai major de tag com prefixo v', () => {
    // Cenário / Ação
    const resultado = parseMajorVersion('v3.8.1')

    // Validação
    expect(resultado).toBe(3)
  })

  it('extrai major de tag sem prefixo v', () => {
    // Cenário / Ação
    const resultado = parseMajorVersion('10.19.4')

    // Validação
    expect(resultado).toBe(10)
  })

  it('retorna 0 para tag inválida', () => {
    // Cenário / Ação
    const resultado = parseMajorVersion('invalid')

    // Validação
    expect(resultado).toBe(0)
  })

  it('retorna 0 para versão 0.x.x', () => {
    // Cenário / Ação
    const resultado = parseMajorVersion('v0.1.0')

    // Validação
    expect(resultado).toBe(0)
  })
})
