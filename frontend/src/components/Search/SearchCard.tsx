import { useRef, useState } from 'react'
import type { SearchRequest } from '../../types'

interface SearchCardProps {
  onSearch: (params: Omit<SearchRequest, 'model' | 'provider'>) => void
  isSearching: boolean
  onCancel: () => void
  model: string
  models: string[]
  onModelChange: (m: string) => void
}

const TIME_LIMITS = [
  { value: '', label: 'Any time' },
  { value: 'd', label: 'Past day' },
  { value: 'w', label: 'Past week' },
  { value: 'm', label: 'Past month' },
  { value: 'y', label: 'Past year' },
]

export function SearchCard({
  onSearch,
  isSearching,
  onCancel,
  model,
  models,
  onModelChange,
}: SearchCardProps) {
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState(2)
  const [concurrency, setConcurrency] = useState(5)
  const [fetchContent, setFetchContent] = useState(true)
  const [timelimit, setTimelimit] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  const handleSearch = () => {
    if (!query.trim() || isSearching) return
    onSearch({
      query: query.trim(),
      num_pages: pages,
      concurrency,
      fetch_content: fetchContent,
      summary_depth: 'all',
      timelimit: timelimit || null,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const toggleMic = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) return

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('')
      setQuery(transcript)
      if (e.results[e.results.length - 1].isFinal) {
        setIsListening(false)
      }
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
  }

  return (
    <div className="search-card" data-testid="search-card">
      <div className="input-row">
        <div className="search-wrap">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            id="search-query"
            className="search-input"
            type="text"
            placeholder="What do you want to research?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search query"
            autoFocus
            data-testid="search-input"
          />
        </div>

        <button
          className={`mic-btn${isListening ? ' listening' : ''}`}
          onClick={toggleMic}
          aria-label={isListening ? 'Stop listening' : 'Voice search'}
          title="Voice search"
          data-testid="mic-btn"
        >
          🎤
        </button>

        <button
          className="search-btn"
          onClick={isSearching ? onCancel : handleSearch}
          disabled={!isSearching && !query.trim()}
          aria-label={isSearching ? 'Cancel search' : 'Search'}
          data-testid="search-btn"
        >
          {isSearching ? '✕ Cancel' : 'Search'}
        </button>
      </div>

      <div className="settings-grid">
        <div className="setting-group">
          <label htmlFor="pages-range">
            Pages
            <span className="setting-val">{pages} <small style={{ fontWeight: 400, color: 'var(--muted)' }}>(~{pages * 10} results)</small></span>
          </label>
          <input
            id="pages-range"
            type="range"
            min={1}
            max={20}
            value={pages}
            onChange={(e) => setPages(+e.target.value)}
            aria-label={`Pages: ${pages}`}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="concurrency-range">
            Concurrency
            <span className="setting-val">{concurrency}</span>
          </label>
          <input
            id="concurrency-range"
            type="range"
            min={1}
            max={20}
            value={concurrency}
            onChange={(e) => setConcurrency(+e.target.value)}
            aria-label={`Concurrency: ${concurrency}`}
          />
        </div>

        <div className="toggle-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input
              id="fetch-content"
              type="checkbox"
              checked={fetchContent}
              onChange={(e) => setFetchContent(e.target.checked)}
            />
            <label htmlFor="fetch-content">Fetch full page content</label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <label htmlFor="timelimit-select" style={{ fontSize: 12, color: 'var(--muted)' }}>Time:</label>
            <select
              id="timelimit-select"
              className="app-select"
              value={timelimit}
              onChange={(e) => setTimelimit(e.target.value)}
              aria-label="Time filter"
            >
              {TIME_LIMITS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <select
              id="search-model-select"
              className="app-select"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              aria-label="AI model"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
