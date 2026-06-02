import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TTSProvider } from '../../contexts/TTSContext'
import { useTTS } from '../../contexts/TTSContext'

function wrapper({ children }: { children: React.ReactNode }) {
  return <TTSProvider>{children}</TTSProvider>
}

describe('useTTS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window.speechSynthesis as { speaking: boolean }).speaking = false
  })

  it('starts not speaking', () => {
    const { result } = renderHook(() => useTTS(), { wrapper })
    expect(result.current.isSpeaking).toBe(false)
  })

  it('starts with empty label', () => {
    const { result } = renderHook(() => useTTS(), { wrapper })
    expect(result.current.label).toBe('')
  })

  it('calls speechSynthesis.speak when speak() is called', () => {
    const { result } = renderHook(() => useTTS(), { wrapper })
    act(() => {
      result.current.speak('Hello world', 'test-label')
    })
    expect(window.speechSynthesis.speak).toHaveBeenCalled()
  })

  it('calls speechSynthesis.cancel when stop() is called', () => {
    const { result } = renderHook(() => useTTS(), { wrapper })
    act(() => result.current.speak('Hello', 'lbl'))
    act(() => result.current.stop())
    expect(window.speechSynthesis.cancel).toHaveBeenCalled()
  })

  it('cancels previous speech before starting new', () => {
    const { result } = renderHook(() => useTTS(), { wrapper })
    act(() => result.current.speak('First', 'label-1'))
    act(() => result.current.speak('Second', 'label-2'))
    // cancel called at least once between the two speaks
    expect(window.speechSynthesis.cancel).toHaveBeenCalled()
  })

  it('throws when useTTS is used outside TTSProvider', () => {
    // Should throw because no provider
    expect(() => renderHook(() => useTTS())).toThrow()
  })
})
