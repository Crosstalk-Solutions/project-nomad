import { describe, it, expect } from 'vitest'
import classNames from '~/lib/classNames'

describe('classNames', () => {
  it('deve juntar múltiplas strings com espaço', () => {
    // Cenário
    const classes = ['foo', 'bar', 'baz']

    // Ação
    const resultado = classNames(...classes)

    // Validação
    expect(resultado).toBe('foo bar baz')
  })

  it('deve ignorar valores undefined', () => {
    // Cenário
    const classe1 = 'foo'
    const classe2 = undefined
    const classe3 = 'bar'

    // Ação
    const resultado = classNames(classe1, classe2, classe3)

    // Validação
    expect(resultado).toBe('foo bar')
  })

  it('deve ignorar strings vazias', () => {
    // Cenário
    const classe1 = 'foo'
    const classe2 = ''
    const classe3 = 'bar'

    // Ação
    const resultado = classNames(classe1, classe2, classe3)

    // Validação
    expect(resultado).toBe('foo bar')
  })

  it('deve retornar string vazia quando chamado sem argumentos', () => {
    // Cenário
    // (nenhum argumento)

    // Ação
    const resultado = classNames()

    // Validação
    expect(resultado).toBe('')
  })

  it('deve lidar com mix de strings e undefined', () => {
    // Cenário
    const classe1 = undefined
    const classe2 = 'active'
    const classe3 = undefined
    const classe4 = 'visible'
    const classe5 = undefined

    // Ação
    const resultado = classNames(classe1, classe2, classe3, classe4, classe5)

    // Validação
    expect(resultado).toBe('active visible')
  })
})
