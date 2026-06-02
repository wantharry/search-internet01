import { useState } from 'react'
import { useLiveNews } from '../../hooks/useLiveNews'
import { LiveCard } from './LiveCard'

const TOPICS = [
  { value: 'all', label: '📰 All News' },
  { value: 'politics', label: '🏛️ Politics' },
  { value: 'sports', label: '⚽ Sports' },
  { value: 'tech', label: '💻 Tech' },
  { value: 'finance', label: '📈 Finance' },
  { value: 'business', label: '💼 Business' },
  { value: 'science', label: '🔬 Science' },
  { value: 'health', label: '🏥 Health' },
  { value: 'environment', label: '🌿 Environment' },
  { value: 'entertainment', label: '🎬 Entertainment' },
  { value: 'ai', label: '🤖 AI / ML' },
  { value: 'gaming', label: '🎮 Gaming' },
  { value: 'realestate', label: '🏠 Real Estate' },
]

const REGIONS = [
  { value: 'world', label: '🌍 World' },
  { value: 'usa', label: '🇺🇸 USA' },
  { value: 'india', label: '🇮🇳 India' },
  { value: 'china', label: '🇨🇳 China' },
  { value: 'europe', label: '🇪🇺 Europe' },
  { value: 'mideast', label: '🕌 Mid East' },
]

const INTERVALS = [
  { value: 60, label: '↻ 1 min' },
  { value: 300, label: '↻ 5 min' },
  { value: 600, label: '↻ 10 min' },
  { value: 1800, label: '↻ 30 min' },
  { value: 3600, label: '↻ 1 hr' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: '⬇ Newest' },
  { value: 'rated', label: '⭐ Top Rated' },
]

export function LiveSection() {
  const [topic, setTopic] = useState('all')
  const [region, setRegion] = useState('usa')
  const [interval, setInterval] = useState(60)
  const [sort, setSort] = useState('newest')
  const [search, setSearch] = useState('')

  // Compute category key from topic + region
  const category = (() => {
    if (topic === 'all') return region === 'world' ? 'all' : region
    if (region === 'world') return topic
    return `${topic}-${region}`
  })()

  const { articles, loading, error, countdown, refresh, lastRefresh } = useLiveNews(
    category,
    interval,
  )

  // Filter & sort
  let displayed = articles
  if (search.trim()) {
    const q = search.toLowerCase()
    displayed = displayed.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.snippet.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q),
    )
  }
  if (sort === 'rated') {
    displayed = [...displayed].sort((a, b) => b.score - a.score)
  }

  return (
    <section id="panel-live" role="tabpanel" aria-label="Live news">
      <div className="live-controls">
        <select
          className="live-sel"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Region"
          data-testid="region-select"
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        <select
          className="live-sel"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          aria-label="Topic"
          data-testid="topic-select"
        >
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          className="live-sel"
          value={interval}
          onChange={(e) => setInterval(+e.target.value)}
          aria-label="Refresh interval"
          id="live-interval"
        >
          {INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>

        <select
          className="live-sel"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort order"
          data-testid="sort-select"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <button
          className="live-refresh-btn"
          onClick={refresh}
          aria-label="Refresh now"
          data-testid="refresh-btn"
        >
          ↻ Refresh
        </button>

        {countdown > 0 && !loading && (
          <span className="live-countdown" aria-live="polite">
            {countdown}s
          </span>
        )}

        <span className="live-status">
          {loading
            ? 'Loading…'
            : lastRefresh
              ? `${displayed.length} articles · ${lastRefresh.toLocaleTimeString()}`
              : ''}
        </span>
      </div>

      {/* Headline search */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          className="search-input"
          style={{ paddingLeft: 16, fontSize: 14 }}
          placeholder="🔍 Search headlines…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter headlines"
          data-testid="headline-search"
        />
      </div>

      <div className="live-grid" role="list" aria-label="News articles" data-testid="live-grid">
        {loading && <div className="live-loading">Loading headlines…</div>}
        {error && <div className="live-error">⚠ {error}</div>}
        {!loading && !error && displayed.length === 0 && (
          <div className="live-loading">No articles found. Try a different filter.</div>
        )}
        {displayed.map((article, i) => (
          <LiveCard
            key={article.url}
            article={article}
            index={i}
            model="llama-3.3-70b-versatile"
            provider="groq"
          />
        ))}
      </div>
    </section>
  )
}
