import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { useTTS } from '../../contexts/TTSContext'
import type { SummaryData, SummaryDepth } from '../../types'

interface SummaryCardProps {
  summaries: Record<SummaryDepth, SummaryData>
  availableDepths: SummaryDepth[]
}

const DEPTH_LABELS: Record<SummaryDepth, string> = {
  ultra_short: 'Quick',
  summary: 'Summary',
  detailed: 'Detailed',
}

function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string
}

export function SummaryCard({ summaries, availableDepths }: SummaryCardProps) {
  const [activeDepth, setActiveDepth] = useState<SummaryDepth>('ultra_short')
  const { speak, stop, isSpeaking, label: ttsLabel } = useTTS()
  const contentRef = useRef<HTMLDivElement>(null)

  // Auto-switch to first available depth
  useEffect(() => {
    if (availableDepths.length && !availableDepths.includes(activeDepth)) {
      setActiveDepth(availableDepths[0])
    }
  }, [availableDepths, activeDepth])

  const current = summaries[activeDepth]
  const isThisReading = isSpeaking && ttsLabel === `summary-${activeDepth}`

  const handleReadAloud = () => {
    if (isThisReading) {
      stop()
    } else {
      speak(current.text, `summary-${activeDepth}`)
    }
  }

  return (
    <div className="summary-card" data-testid="summary-card" role="region" aria-label="AI Summary">
      <div className="summary-card-header">
        <span aria-hidden="true">✨</span>
        AI Summary
        <button
          className={`read-aloud-btn${isThisReading ? ' speaking' : ''}`}
          onClick={handleReadAloud}
          aria-label={isThisReading ? 'Stop reading' : 'Read aloud'}
          style={{ marginLeft: 'auto' }}
          data-testid="read-aloud-btn"
        >
          {isThisReading ? '⏹ Stop' : '🔊 Read'}
        </button>
      </div>

      <div className="summary-tabs" role="tablist" aria-label="Summary depth">
        {(['ultra_short', 'summary', 'detailed'] as SummaryDepth[]).map((depth) => {
          const s = summaries[depth]
          const isAvailable = availableDepths.includes(depth)
          return (
            <button
              key={depth}
              role="tab"
              aria-selected={activeDepth === depth}
              className={`sum-tab${activeDepth === depth ? ' active' : ''}`}
              onClick={() => isAvailable && setActiveDepth(depth)}
              disabled={!isAvailable}
              data-testid={`sum-tab-${depth}`}
            >
              <span
                className={`tab-dot${s.streaming ? ' streaming' : s.done ? ' done' : ''}`}
                aria-hidden="true"
              />
              {DEPTH_LABELS[depth]}
            </button>
          )
        })}
      </div>

      <div
        ref={contentRef}
        className="md-body"
        role="tabpanel"
        aria-label={DEPTH_LABELS[activeDepth]}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(current.text || (current.streaming ? '…' : '')) }}
        data-testid="summary-content"
      />
    </div>
  )
}
