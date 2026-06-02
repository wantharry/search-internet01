import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLiveNews } from '../../hooks/useLiveNews'

vi.mock('../../api/client', () => ({
  getLiveFeed: vi.fn(),
}))

import { getLiveFeed } from '../../api/client'

const MOCK_ARTICLES = [
  {
    title: 'AI Breakthrough',
    url: 'https://techcrunch.com/ai-breakthrough',
    source: 'TechCrunch',
    published: new Date().toISOString(),
    snippet: 'Major AI breakthrough announced.',
    topic: 'AI',
    importance: 'high',
    score: 4,
  },
]

// useLiveNews reads data.items (LiveFeedResponse shape)
const MOCK_RESPONSE = { items: MOCK_ARTICLES, total: 1, from_cache: 0, from_rss: 1, category: 'all' }

describe('useLiveNews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts in loading state', () => {
    ;(getLiveFeed as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, from_cache: 0, from_rss: 0, category: 'all' })
    const { result } = renderHook(() => useLiveNews('all', 60))
    expect(result.current.loading).toBe(true)
  })

  it('populates articles after fetch', async () => {
    ;(getLiveFeed as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE)
    const { result } = renderHook(() => useLiveNews('all', 60))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.articles).toHaveLength(1)
    expect(result.current.articles[0].title).toBe('AI Breakthrough')
  })

  it('sets error on fetch failure', async () => {
    ;(getLiveFeed as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useLiveNews('tech', 60))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('refetches when category changes', async () => {
    ;(getLiveFeed as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE)
    const { result, rerender } = renderHook(({ cat }) => useLiveNews(cat, 60), {
      initialProps: { cat: 'all' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ cat: 'tech' })
    await waitFor(() => expect(getLiveFeed).toHaveBeenCalledWith('tech'))
  })

  it('provides refresh function', async () => {
    ;(getLiveFeed as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, from_cache: 0, from_rss: 0, category: 'all' })
    const { result } = renderHook(() => useLiveNews('all', 60))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.refresh())
    await waitFor(() => expect(getLiveFeed).toHaveBeenCalledTimes(2))
  })

  it('initialises countdown to interval', async () => {
    ;(getLiveFeed as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, from_cache: 0, from_rss: 0, category: 'all' })
    const { result } = renderHook(() => useLiveNews('all', 120))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.countdown).toBeLessThanOrEqual(120)
  })
})
