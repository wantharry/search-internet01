import { marked } from 'marked'
import { useSummaryMode } from '../../contexts/SummaryModeContext'

function markdownToText(md: string): string {
  // Strip markdown syntax to get plain text
  return md
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function textToBullets(md: string): string[] {
  const plain = markdownToText(md)
  // Split on sentence boundaries
  const sentences = plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
  return sentences
}

interface SummaryDisplayProps {
  html: string       // raw markdown from AI
  loading?: boolean
}

export function SummaryDisplay({ html, loading }: SummaryDisplayProps) {
  const { mode, toggle } = useSummaryMode()

  const bullets = mode === 'bullets' ? textToBullets(html) : []
  const paragraphHtml = marked.parse(html, { async: false }) as string

  return (
    <div className="summary-display">
      {loading && !html && (
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Summarizing…</span>
      )}
      {html && (
        <>
          <div className="summary-mode-bar">
            <button
              className={`summary-mode-btn${mode === 'paragraph' ? ' active' : ''}`}
              onClick={toggle}
              aria-label="Switch to paragraph mode"
              title="Paragraph mode"
            >
              ¶
            </button>
            <button
              className={`summary-mode-btn${mode === 'bullets' ? ' active' : ''}`}
              onClick={toggle}
              aria-label="Switch to bullet-point mode"
              title="Bullet-point mode"
            >
              • •
            </button>
          </div>

          {mode === 'paragraph' ? (
            <div
              className="summary-md"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: paragraphHtml }}
            />
          ) : (
            <ul className="summary-bullets">
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
