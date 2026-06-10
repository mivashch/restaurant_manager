import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistedState } from '../usePersistedState'

const STORAGE_KEY = 'test_key'

beforeEach(() => {
  sessionStorage.clear()
})

describe('usePersistedState', () => {
  it('returns the default value when no stored value exists', () => {
    const { result } = renderHook(() => usePersistedState(STORAGE_KEY, 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('reads existing value from sessionStorage', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify('stored'))
    const { result } = renderHook(() => usePersistedState(STORAGE_KEY, 'default'))
    expect(result.current[0]).toBe('stored')
  })

  it('stores numeric values', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(42))
    const { result } = renderHook(() => usePersistedState(STORAGE_KEY, 0))
    expect(result.current[0]).toBe(42)
  })

  it('stores object values', () => {
    const obj = { name: 'test', count: 5 }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    const { result } = renderHook(() => usePersistedState(STORAGE_KEY, {}))
    expect(result.current[0]).toEqual(obj)
  })

  it('updates sessionStorage when value changes', () => {
    const { result } = renderHook(() => usePersistedState(STORAGE_KEY, 'initial'))

    act(() => {
      result.current[1]('updated')
    })

    expect(result.current[0]).toBe('updated')
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toBe('updated')
  })

  it('handles JSON parse errors gracefully', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not-valid-json')
    const { result } = renderHook(() => usePersistedState(STORAGE_KEY, 'fallback'))
    expect(result.current[0]).toBe('fallback')
  })
})
