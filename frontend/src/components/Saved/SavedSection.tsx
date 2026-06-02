import { useState } from 'react'
import { useBookmarksCtx } from '../../contexts/BookmarksContext'
import type { BookmarkedArticle } from '../../hooks/useBookmarks'

function formatDate(ms: number) {
  return new Date(ms).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SavedCard({ article, onRemove }: { article: BookmarkedArticle; onRemove: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: article.title, url: article.url }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(article.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <article className="saved-card" data-testid="saved-card">
      <button className="alert-dismiss" onClick={onRemove} aria-label="Remove bookmark">×</button>

      <div className="live-card-source">
        {article.source}
        {article.topic && (
          <span className={`live-topic-badge ${article.topic.replace(/\s+/g, '')}`}>
            {article.topic}
          </span>
        )}
      </div>

      <div className="live-card-title">
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
      </div>

      <div className="live-card-meta">
        <span className="live-card-received">saved {formatDate(article.bookmarkedAt)}</span>
      </div>

      {article.snippet && (
        <p className="live-card-snippet">{article.snippet}</p>
      )}

      <div className="live-card-actions" style={{ marginTop: 10 }}>
        <button
          className="card-action-btn"
          onClick={handleShare}
          aria-label="Share article"
        >
          {copied ? '✓ Copied' : '↗ Share'}
        </button>
        <button
          className="card-action-btn bookmark-btn saved"
          onClick={onRemove}
          aria-label="Remove bookmark"
        >
          ★ Saved
        </button>
      </div>
    </article>
  )
}

export function SavedSection() {
  const { bookmarks, remove, clear } = useBookmarksCtx()
  const [search, setSearch] = useState('')

  const displayed = search.trim()
    ? bookmarks.filter((b) =>
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        b.source.toLowerCase().includes(search.toLowerCase()) ||
        b.snippet.toLowerCase().includes(search.toLowerCase()),
      )
    : bookmarks

  return (
    <section id="panel-saved" role="tabpanel" aria-label="Saved articles">
      <div className="alerts-toolbar">
        <span className="alerts-status" style={{ marginLeft: 0, marginRight: 'auto' }}>
          {bookmarks.length} saved
        </span>
        {bookmarks.length > 0 && (
          <button
            className="alerts-ctrl-btn"
            onClick={() => { if (confirm('Clear all bookmarks?')) clear() }}
            aria-label="Clear all bookmarks"
          >
            🗑 Clear all
          </button>
        )}
      </div>

      {bookmarks.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <input
            type="text"
            className="search-input"
            style={{ paddingLeft: 16, fontSize: 14 }}
            placeholder="🔍 Search saved articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search bookmarks"
          />
        </div>
      )}

      {bookmarks.length === 0 ? (
        <div className="alerts-empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>☆</div>
          <div>No saved articles yet.</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            Tap <strong>☆ Save</strong> on any article to bookmark it here.
          </div>
        </div>
      ) : displayed.length === 0 ? (
        <div className="alerts-empty">No articles match your search.</div>
      ) : (
        <div className="alerts-stack">
          {displayed.map((a) => (
            <SavedCard key={a.url} article={a} onRemove={() => remove(a.url)} />
          ))}
        </div>
      )}
    </section>
  )
}
