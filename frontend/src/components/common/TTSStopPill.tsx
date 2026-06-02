import { useTTS } from '../../contexts/TTSContext'

export function TTSStopPill() {
  const { isSpeaking, label, stop } = useTTS()

  if (!isSpeaking) return null

  const displayLabel = label?.startsWith('summary-')
    ? `Summary – ${label.split('-')[1]}`
    : label?.startsWith('live-')
      ? 'Article'
      : label?.startsWith('result-')
        ? 'Search result'
        : label ?? 'Reading'

  return (
    <div
      className="tts-stop-pill"
      role="status"
      aria-live="polite"
      aria-label={`Reading: ${displayLabel}`}
      data-testid="tts-stop-pill"
    >
      <div className="pill-tts-wave" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} />
        ))}
      </div>
      <span className="pill-text">Reading: {displayLabel}</span>
      <button
        className="pill-stop-btn"
        onClick={stop}
        aria-label="Stop reading"
        data-testid="pill-stop-btn"
      >
        ⏹ Stop
      </button>
    </div>
  )
}
