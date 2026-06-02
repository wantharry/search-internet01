import { useTTS } from '../../contexts/TTSContext'
import type { SearchResult } from '../../types'

interface ResultCardProps {
  result: SearchResult
}

function truncateUrl(url: string, max = 60): string {
  try {
    const u = new URL(url)
    const path = u.hostname + u.pathname
    return path.length > max ? path.slice(0, max) + '…' : path
  } catch {
    return url.slice(0, max)
  }
}

export function ResultCard({ result }: ResultCardProps) {
  const { speak, stop, isSpeaking, label: ttsLabel } = useTTS()
  const isThisReading = isSpeaking && ttsLabel === `result-${result.url}`

  const handleTTS = () => {
    if (isThisReading) stop()
    else speak(`${result.title}. ${result.snippet}`, `result-${result.url}`)
  }

  return (
    <article className="result-card" role="listitem" data-testid="result-card">
      <div className="result-title">
        <a href={result.url} target="_blank" rel="noopener noreferrer">
          {result.title}
        </a>
      </div>
      <div className="result-url" title={result.url}>
        {truncateUrl(result.url)}
      </div>
      {result.snippet && (
        <p className="result-snippet">{result.snippet}</p>
      )}
      <div className="result-meta">
        {result.content_length > 0 && (
          <span className="tag">📄 {Math.round(result.content_length / 100) / 10}k chars</span>
        )}
        <button
          className={`live-tts-btn${isThisReading ? ' speaking' : ''}`}
          onClick={handleTTS}
          aria-label={isThisReading ? 'Stop reading' : 'Read article aloud'}
          data-testid="result-tts-btn"
        >
          {isThisReading ? '⏹' : '🔊'}
        </button>
      </div>
    </article>
  )
}
