// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import useDebounce from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    // Freeze the system time so we can control the milliseconds
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Restore normal time after the test
    vi.useRealTimers()
  })

  it('should debounce function calls', () => {
    // renderHook is the safe way to test React hooks in isolation
    const { result } = renderHook(() => useDebounce())
    const mockFn = vi.fn()

    const debouncedFn = result.current.debounce(mockFn, 500)
    
    // Call the function 3 times in a row very quickly
    debouncedFn()
    debouncedFn()
    debouncedFn()

    // Advance time by 499ms - The function should not have been executed yet
    vi.advanceTimersByTime(499)
    expect(mockFn).not.toHaveBeenCalled()

    // Advance the remaining 1ms (totaling 500ms)
    vi.advanceTimersByTime(1)
    
    // The original function must be called EXACTLY ONCE
    expect(mockFn).toHaveBeenCalledTimes(1) 
  })
})