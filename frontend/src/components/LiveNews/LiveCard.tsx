import { useCallback, useState } from 'react'
import { streamSearch } from '../../api/client'
import { useTTS } from '../../contexts/TTSContext'
import { CardActions } from '../common/CardActions'
import { SummaryDisplay } from '../common/SummaryDisplay'
import type { Article } from '../../types'

interface LiveCardProps {
  article: Article
  index: number
  model: string
  provider: string
}

function timeAgo(published: string): string {
  if (!published) return ''
  try {
    // published is e.g. "Mon, 02 Jun 2026 14:30 UTC"
    const d = new Date(published)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
    return `${Math.round(diff / 86400)}d ago`
  } catch {
    return published.slice(0, 16)
  }
}

function formatFetchedAt(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LiveCard({ article, index, model, provider }: LiveCardProps) {
  const [aiSummary, setAiSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [rating, setRating] = useState(0)
  const { speak, stop, isSpeaking, label: ttsLabel } = useTTS()
  const ttsId = `live-${article.url}`
  const isThisReading = isSpeaking && ttsLabel === ttsId

  const handleSummarize = useCallback(() => {
    if (summarizing) return
    if (showSummary && aiSummary) {
      setShowSummary((v) => !v)
      return
    }
    setSummarizing(true)
    setShowSummary(true)
    setAiSummary('')

    const cancelFn = streamSearch(
      {
        query: article.title,
        num_pages: 1,
        concurrency: 1,
        fetch_content: false,
        model,
        summary_depth: 'ultra_short',
        timelimit: null,
        provider,
      },
      (evt) => {
        if (evt.type === 'summary_chunk' && evt.depth === 'ultra_short') {
          setAiSummary((prev) => prev + (evt.text as string))
        }
      },
      () => setSummarizing(false),
      () => setSummarizing(false),
    )

    // Cleanup after 60s max
    setTimeout(cancelFn, 60_000)
  }, [article.title, article.snippet, model, provider, summarizing, showSummary, aiSummary])

  const handleTTS = () => {
    if (isThisReading) {
      stop()
    } else {
      // If a summary has been generated, read it; otherwise read title + snippet
      const summaryText = aiSummary
        ? aiSummary.replace(/<[^>]+>/g, '').trim()
        : ''
      const text = summaryText
        ? `${article.title}. ${summaryText}`
        : `${article.title}. ${article.snippet}`
      speak(text, ttsId)
    }
  }

  const importanceCls =
    article.importance === 'breaking'
      ? ' breaking'
      : article.importance === 'high'
        ? ' high'
        : ''

  return (
    <article
      className={`live-card${importanceCls}`}
      role="listitem"
      style={{ animationDelay: `${Math.min(index, 30) * 22}ms` } as React.CSSProperties}
      data-testid="live-card"
    >
      <div className="live-card-source">
        {article.source}
        {article.topic && (
          <span
            className={`live-topic-badge ${article.topic.replace(/\s+/g, '')}`}
            data-testid="topic-badge"
          >
            {article.topic}
          </span>
        )}
      </div>

      <div className="live-card-title">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="card-title-link"
        >
          {article.title}
        </a>
      </div>

      {article.published && (
        <div className="live-card-meta">
          {timeAgo(article.published)}
          {article.fetched_at ? (
            <span className="live-card-received"> · received {formatFetchedAt(article.fetched_at)}</span>
          ) : null}
        </div>
      )}
      {!article.published && article.fetched_at ? (
        <div className="live-card-meta">
          <span className="live-card-received">received {formatFetchedAt(article.fetched_at)}</span>
        </div>
      ) : null}

      {article.snippet && (
        <p className="live-card-snippet">{article.snippet}</p>
      )}

      {showSummary && (
        <div className="live-ai-summary" data-testid="ai-summary">
          <SummaryDisplay html={aiSummary} loading={summarizing} />
        </div>
      )}

      <div className="live-card-footer">
        <div className="live-star-rating" aria-label="Rate this article">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              className={`live-star${rating >= star ? ' active' : ''}`}
              onClick={() => setRating((r) => (r === star ? 0 : star))}
              aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
              data-testid={`star-${star}`}
            >
              ★
            </button>
          ))}
        </div>

        <CardActions article={article}>
          <button
            className="live-summarize-btn"
            onClick={handleSummarize}
            disabled={summarizing}
            aria-label="Summarize with AI"
            data-testid="summarize-btn"
          >
            ✨ {showSummary ? (aiSummary ? 'Hide' : 'Loading…') : 'Summarize'}
          </button>

          <button
            className={`live-tts-btn${isThisReading ? ' speaking' : ''}`}
            onClick={handleTTS}
            aria-label={isThisReading ? 'Stop reading' : aiSummary ? 'Read summary aloud' : 'Read aloud'}
            title={aiSummary && !isThisReading ? 'Read AI summary aloud' : undefined}
            data-testid="live-tts-btn"
          >
            {isThisReading ? '⏹' : '🔊'}
          </button>
        </CardActions>
      </div>
    </article>
  )
}
