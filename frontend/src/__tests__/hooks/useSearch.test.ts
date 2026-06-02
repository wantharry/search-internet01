import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSearch } from '../../hooks/useSearch'

vi.mock('../../api/client', () => ({
  streamSearch: vi.fn(),
}))

import { streamSearch } from '../../api/client'

describe('useSearch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts in idle state', () => {
    const { result } = renderHook(() => useSearch())
    expect(result.current.state.isSearching).toBe(false)
    expect(result.current.state.results).toHaveLength(0)
    expect(result.current.state.error).toBeNull()
    expect(result.current.state.isDone).toBe(false)
  })

  it('returns availableDepths', () => {
    const { result } = renderHook(() => useSearch())
    expect(result.current.availableDepths).toEqual([])
  })

  it('sets isSearching to true when search is called', () => {
    ;(streamSearch as ReturnType<typeof vi.fn>).mockImplementation(() => () => {})
    const { result } = renderHook(() => useSearch())
    act(() => {
      result.current.search({
        query: 'test',
        num_pages: 1,
        concurrency: 5,
        fetch_content: false,
        summary_depth: 'all',
        timelimit: null,
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
      })
    })
    expect(result.current.state.isSearching).toBe(true)
  })

  it('accumulates results from events', () => {
    let capturedCallback: ((evt: Record<string, unknown>) => void) | null = null
    ;(streamSearch as ReturnType<typeof vi.fn>).mockImplementation(
      (_req: unknown, onEvent: (evt: Record<string, unknown>) => void) => {
        capturedCallback = onEvent
        return () => {}
      },
    )
    const { result } = renderHook(() => useSearch())
    act(() => {
      result.current.search({
        query: 'news',
        num_pages: 1,
        concurrency: 5,
        fetch_content: false,
        summary_depth: 'all',
        timelimit: null,
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
      })
    })
    act(() => {
      capturedCallback?.({
        type: 'result',
        result: {
          index: 0,
          title: 'Test Article',
          url: 'https://test.com',
          snippet: 'A test snippet',
          content_length: 1000,
          score: 0.9,
        },
        progress: '1/10',
      })
    })
    expect(result.current.state.results).toHaveLength(1)
    expect(result.current.state.results[0].title).toBe('Test Article')
  })

  it('handles status events', () => {
    let capturedCallback: ((evt: Record<string, unknown>) => void) | null = null
    ;(streamSearch as ReturnType<typeof vi.fn>).mockImplementation(
      (_req: unknown, onEvent: (evt: Record<string, unknown>) => void) => {
        capturedCallback = onEvent
        return () => {}
      },
    )
    const { result } = renderHook(() => useSearch())
    act(() => {
      result.current.search({
        query: 'test',
        num_pages: 1,
        concurrency: 5,
        fetch_content: false,
        summary_depth: 'all',
        timelimit: null,
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
      })
    })
    act(() => {
      capturedCallback?.({ type: 'status', message: 'Searching…' })
    })
    expect(result.current.state.status).toBe('Searching…')
  })

  it('marks isDone when done event fires', () => {
    let capturedCallback: ((evt: Record<string, unknown>) => void) | null = null
    ;(streamSearch as ReturnType<typeof vi.fn>).mockImplementation(
      (_req: unknown, onEvent: (evt: Record<string, unknown>) => void) => {
        capturedCallback = onEvent
        return () => {}
      },
    )
    const { result } = renderHook(() => useSearch())
    act(() => {
      result.current.search({
        query: 'test',
        num_pages: 1,
        concurrency: 5,
        fetch_content: false,
        summary_depth: 'all',
        timelimit: null,
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
      })
    })
    // done is dispatched via the SSE event, not the onDone callback
    act(() => capturedCallback?.({ type: 'done', total: 5 }))
    expect(result.current.state.isDone).toBe(true)
    expect(result.current.state.isSearching).toBe(false)
  })

  it('cancel clears isSearching', () => {
    ;(streamSearch as ReturnType<typeof vi.fn>).mockImplementation(() => () => {})
    const { result } = renderHook(() => useSearch())
    act(() => {
      result.current.search({
        query: 'test',
        num_pages: 1,
        concurrency: 5,
        fetch_content: false,
        summary_depth: 'all',
        timelimit: null,
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
      })
    })
    act(() => result.current.cancel())
    expect(result.current.state.isSearching).toBe(false)
  })

  it('captures error events', () => {
    let capturedError: ((msg: string) => void) | null = null
    ;(streamSearch as ReturnType<typeof vi.fn>).mockImplementation(
      (_req: unknown, _onEvent: unknown, onError: (msg: string) => void) => {
        capturedError = onError
        return () => {}
      },
    )
    const { result } = renderHook(() => useSearch())
    act(() => {
      result.current.search({
        query: 'test',
        num_pages: 1,
        concurrency: 5,
        fetch_content: false,
        summary_depth: 'all',
        timelimit: null,
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
      })
    })
    act(() => capturedError?.('Network failure'))
    expect(result.current.state.error).toBe('Network failure')
    expect(result.current.state.isSearching).toBe(false)
  })
})
