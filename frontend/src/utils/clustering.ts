import type { Article } from '../types'

const STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','as','is','was','are','were','be','been','being','have',
  'has','had','do','does','did','will','would','could','should','may',
  'might','shall','can','this','that','these','those','it','its',
  'he','she','they','we','you','i','my','your','his','her','their',
  'our','after','before','over','under','about','into','than','then',
  'when','who','what','which','how','new','says','say','said',
])

function keywords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  )
}

export interface Cluster {
  /** Articles in this cluster, best first */
  articles: Article[]
  /** Shared keywords that linked these articles */
  sharedKeywords: string[]
}

/** Group articles into story clusters sharing ≥2 significant keywords */
export function clusterArticles(articles: Article[]): Cluster[] {
  if (articles.length === 0) return []

  const kws = articles.map((a) => keywords(a.title))

  // Union-Find
  const parent = articles.map((_, i) => i)
  function find(i: number): number {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  function union(a: number, b: number) { parent[find(a)] = find(b) }

  const edgeShared: string[][] = articles.map(() => [])

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const shared = [...kws[i]].filter((w) => kws[j].has(w))
      if (shared.length >= 2) {
        union(i, j)
        // Keep the shared words for the representative
        const rep = find(i)
        edgeShared[rep] = [...new Set([...edgeShared[rep], ...shared])]
      }
    }
  }

  // Build groups
  const groups = new Map<number, number[]>()
  for (let i = 0; i < articles.length; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(i)
  }

  return [...groups.values()].map((indices) => {
    const rep = find(indices[0])
    return {
      articles: indices.map((i) => articles[i]),
      sharedKeywords: edgeShared[rep] ?? [],
    }
  })
}
