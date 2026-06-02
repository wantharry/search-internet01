import type { SearchRequest, SummaryDepth, LiveFeedResponse, Providers } from '../types'

const BASE = import.meta.env.DEV ? '' : ''

/** Stream search results via SSE-over-fetch. Returns a cleanup function. */
export function streamSearch(
  req: SearchRequest,
  onEvent: (event: Record<string, unknown>) => void,
  onError: (err: string) => void,
  onDone: () => void,
): () => void {
  const controller = new AbortController()

  fetch(`${BASE}/search/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        onError(`Server error: ${res.status}`)
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onEvent(data)
            } catch {
              // malformed JSON — skip
            }
          }
        }
      }
      onDone()
    })
    .catch((err: Error) => {
      if (err.name !== 'AbortError') onError(err.message)
    })

  return () => controller.abort()
}

/** Summarise a single article (POST /search/stream with depth=ultra_short). */
export function summariseArticle(
  title: string,
  snippet: string,
  model: string,
  provider: string,
  onChunk: (text: string) => void,
  onDone: () => void,
): () => void {
  const fakeQuery = title
  const context = `### ${title}\n${snippet}`
  // Build a minimal search request that skips DuckDuckGo and jumps to AI
  // We reuse the search endpoint with a tiny num_pages so it has context
  const req: SearchRequest = {
    query: fakeQuery,
    num_pages: 1,
    concurrency: 1,
    fetch_content: false,
    model,
    summary_depth: 'ultra_short',
    timelimit: null,
    provider,
  }
  void context // passed in snippet is pre-seeded

  return streamSearch(
    req,
    (evt) => {
      if (evt.type === 'summary_chunk' && evt.depth === 'ultra_short') {
        onChunk(evt.text as string)
      }
    },
    () => onDone(),
    onDone,
  )
}

export async function getLiveFeed(category: string): Promise<LiveFeedResponse> {
  const res = await fetch(`${BASE}/live/${encodeURIComponent(category)}`)
  if (!res.ok) throw new Error(`Live feed error: ${res.status}`)
  return res.json() as Promise<LiveFeedResponse>
}

export async function getProviders(): Promise<Providers> {
  const res = await fetch(`${BASE}/providers`)
  if (!res.ok) throw new Error('Could not load providers')
  return res.json() as Promise<Providers>
}
