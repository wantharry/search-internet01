import { useCallback, useState } from 'react'
import { marked } from 'marked'
import { streamSearch } from '../../api/client'
import { useTTS } from '../../contexts/TTSContext'
import { CardActions } from '../common/CardActions'
import type { Alert } from '../../types'

interface AlertCardProps {
  alert: Alert
  onDismiss: (url: string) => void
  model: string
  provider: string
}

function timeAgo(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function formatFetchedAt(d: Date): string {
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string
}

export function AlertCard({ alert, onDismiss, model, provider }: AlertCardProps) {
  const [aiSummary, setAiSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const { speak, stop, isSpeaking, label: ttsLabel } = useTTS()
  const ttsId = `alert-${alert.url}`
  const isThisReading = isSpeaking && ttsLabel === ttsId

  const importanceCls =
    alert.importance === 'breaking'
      ? ' breaking'
      : alert.importance === 'high'
        ? ' high'
        : ''

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
        query: alert.title,
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
    setTimeout(cancelFn, 60_000)
  }, [alert.title, model, provider, summarizing, showSummary, aiSummary])

  const handleTTS = () => {
    if (isThisReading) {
      stop()
    } else {
      const summaryText = aiSummary
        ? aiSummary.replace(/<[^>]+>/g, '').trim()
        : ''
      const text = summaryText
        ? `${alert.title}. ${summaryText}`
        : `${alert.title}. ${alert.snippet}`
      speak(text, ttsId)
    }
  }

  return (
    <article
      className={`alert-card${importanceCls}${!alert.read ? ' unread' : ''}`}
      role="listitem"
      data-testid="alert-card"
    >
      <button
        className="alert-dismiss"
        onClick={() => onDismiss(alert.url)}
        aria-label="Dismiss alert"
        data-testid="alert-dismiss"
      >
        ×
      </button>

      <div className="alert-meta">
        <span className="alert-source">{alert.source}</span>
        {alert.importance === 'breaking' && (
          <span
            className="live-topic-badge Breaking"
            data-testid="breaking-badge"
          >
            BREAKING
          </span>
        )}
        <span className="alert-time">
          {timeAgo(alert.fetchedAt)} · <span className="live-card-received">{formatFetchedAt(alert.fetchedAt)}</span>
        </span>
      </div>

      <div className="alert-title">
        <a href={alert.url} target="_blank" rel="noopener noreferrer">
          {alert.title}
        </a>
      </div>

      {alert.snippet && (
        <p className="alert-snippet">{alert.snippet}</p>
      )}

      {showSummary && (
        <div className="live-ai-summary" data-testid="ai-summary">
          {summarizing && !aiSummary && (
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Summarizing…</span>
          )}
          {aiSummary && (
            <div
              className="summary-md"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderMarkdown(aiSummary) }}
            />
          )}
        </div>
      )}

      <CardActions article={alert} >
        <button
          className="live-summarize-btn"
          onClick={handleSummarize}
          disabled={summarizing}
          aria-label="Summarize with AI"
          data-testid="summarize-btn"
          style={{ marginTop: 10 }}
        >
          ✨ {showSummary ? (aiSummary ? 'Hide' : 'Loading…') : 'Summarize'}
        </button>
        <button
          className={`live-tts-btn${isThisReading ? ' speaking' : ''}`}
          onClick={handleTTS}
          aria-label={isThisReading ? 'Stop reading' : aiSummary ? 'Read summary aloud' : 'Read aloud'}
          title={aiSummary && !isThisReading ? 'Read AI summary aloud' : undefined}
          data-testid="alert-tts-btn"
        >
          {isThisReading ? '⏹' : '🔊'}
        </button>
      </CardActions>
    </article>
  )
}
