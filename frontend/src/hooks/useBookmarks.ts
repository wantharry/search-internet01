import { useCallback, useEffect, useState } from 'react'
import type { Article } from '../types'

export interface BookmarkedArticle extends Article {
  bookmarkedAt: number // unix ms
}

const STORAGE_KEY = 'pw_bookmarks'

function load(): BookmarkedArticle[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function save(items: BookmarkedArticle[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // storage full — ignore
  }
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkedArticle[]>(load)

  // Keep in sync across tabs
  useEffect(() => {
    const handler = () => setBookmarks(load())
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const isBookmarked = useCallback(
    (url: string) => bookmarks.some((b) => b.url === url),
    [bookmarks],
  )

  const toggle = useCallback((article: Article) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.url === article.url)
      const next = exists
        ? prev.filter((b) => b.url !== article.url)
        : [{ ...article, bookmarkedAt: Date.now() }, ...prev]
      save(next)
      return next
    })
  }, [])

  const remove = useCallback((url: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.url !== url)
      save(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    save([])
    setBookmarks([])
  }, [])

  return { bookmarks, isBookmarked, toggle, remove, clear }
}
