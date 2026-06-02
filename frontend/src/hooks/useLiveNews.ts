import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveFeed } from '../api/client'
import type { Article, LiveFeedResponse } from '../types'

interface LiveNewsState {
  articles: Article[]
  loading: boolean
  error: string | null
  total: number
  fromCache: number
  fromRss: number
  lastRefresh: Date | null
}

export function useLiveNews(category: string) {
  const [state, setState] = useState<LiveNewsState>({
    articles: [],
    loading: false,
    error: null,
    total: 0,
    fromCache: 0,
    fromRss: 0,
    lastRefresh: null,
  })
  const categoryRef = useRef(category)
  categoryRef.current = category

  const load = useCallback(async (cat: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data: LiveFeedResponse = await getLiveFeed(cat)
      setState({
        articles: data.items ?? [],
        loading: false,
        error: null,
        total: data.total ?? 0,
        fromCache: data.from_cache ?? 0,
        fromRss: data.from_rss ?? 0,
        lastRefresh: new Date(),
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Load failed',
      }))
    }
  }, [])

  // Load on category change
  useEffect(() => {
    void load(category)
  }, [category, load])

  const refresh = useCallback(() => {
    void load(categoryRef.current)
  }, [load])

  return { ...state, refresh, load }
}
