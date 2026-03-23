import { describe, it, expect } from 'vitest'
import classNames from './classNames'

describe('classNames', () => {
  it('should join multiple valid class strings with a space', () => {
    expect(classNames('btn', 'btn-primary', 'active')).toBe('btn btn-primary active')
  })

  it('should filter out undefined, null, and empty values', () => {
    expect(classNames('container', undefined, 'mx-auto', null as any, '', 'p-4')).toBe('container mx-auto p-4')
  })

  it('should handle empty arguments without breaking', () => {
    expect(classNames()).toBe('')
  })
})