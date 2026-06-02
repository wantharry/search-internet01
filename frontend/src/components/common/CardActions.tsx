import { useState } from 'react'
import { useBookmarksCtx } from '../../contexts/BookmarksContext'
import type { Article } from '../../types'

interface CardActionsProps {
  article: Article
  /** Extra buttons (summarize, tts, etc.) rendered before share/bookmark */
  children?: React.ReactNode
}

export function CardActions({ article, children }: CardActionsProps) {
  const { isBookmarked, toggle } = useBookmarksCtx()
  const saved = isBookmarked(article.url)
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: article.title, url: article.url })
      } catch {
        // user cancelled — ignore
      }
    } else {
      await navigator.clipboard.writeText(article.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="live-card-actions">
      {children}
      <button
        className="card-action-btn"
        onClick={handleShare}
        title={copied ? 'Copied!' : 'Share / copy link'}
        aria-label="Share article"
      >
        {copied ? '✓ Copied' : '↗ Share'}
      </button>
      <button
        className={`card-action-btn bookmark-btn${saved ? ' saved' : ''}`}
        onClick={() => toggle(article)}
        title={saved ? 'Remove bookmark' : 'Bookmark'}
        aria-label={saved ? 'Remove bookmark' : 'Bookmark article'}
      >
        {saved ? '★ Saved' : '☆ Save'}
      </button>
    </div>
  )
}
