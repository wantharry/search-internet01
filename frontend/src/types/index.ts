export type Tab = 'search' | 'live' | 'alerts' | 'saved'

export type SummaryDepth = 'ultra_short' | 'summary' | 'detailed'

export interface SearchRequest {
  query: string
  num_pages: number
  concurrency: number
  fetch_content: boolean
  model: string
  summary_depth: 'all' | SummaryDepth
  timelimit: string | null
  provider: string
}

export interface SearchResult {
  index: number
  title: string
  url: string
  snippet: string
  content_length: number
  score?: number
}

export interface SummaryData {
  depth: SummaryDepth
  label: string
  text: string
  streaming: boolean
  done: boolean
}

export interface SearchState {
  status: string
  progress: string
  results: SearchResult[]
  summaries: Record<SummaryDepth, SummaryData>
  isSearching: boolean
  isDone: boolean
  error: string | null
  total: number
}

export interface Article {
  url: string
  title: string
  snippet: string
  source: string
  topic: string
  published: string
  published_ts: number
  fetched_at: number
  importance: 'breaking' | 'high' | 'normal'
  score: number
}

export interface LiveFeedResponse {
  items: Article[]
  from_cache: number
  from_rss: number
  category: string
  total: number
}

export interface Providers {
  groq: string[]
  ollama: string[]
}

export interface Alert extends Article {
  id: string
  read: boolean
  fetchedAt: Date
}
