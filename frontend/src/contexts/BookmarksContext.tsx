import { createContext, useContext, type ReactNode } from 'react'
import { useBookmarks, type BookmarkedArticle } from '../hooks/useBookmarks'
import type { Article } from '../types'

interface BookmarksCtx {
  bookmarks: BookmarkedArticle[]
  isBookmarked: (url: string) => boolean
  toggle: (article: Article) => void
  remove: (url: string) => void
  clear: () => void
}

const Ctx = createContext<BookmarksCtx | null>(null)

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const value = useBookmarks()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBookmarksCtx(): BookmarksCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBookmarksCtx must be inside BookmarksProvider')
  return ctx
}
