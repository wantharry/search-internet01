import { useState } from 'react'
import type { Cluster } from '../../utils/clustering'
import { LiveCard } from './LiveCard'

interface ClusterCardProps {
  cluster: Cluster
  baseIndex: number
  model: string
  provider: string
}

export function ClusterCard({ cluster, baseIndex, model, provider }: ClusterCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { articles, sharedKeywords } = cluster
  const lead = articles[0]
  const rest = articles.slice(1)

  return (
    <div className="cluster-card" data-testid="cluster-card">
      {/* Lead article shown normally */}
      <LiveCard article={lead} index={baseIndex} model={model} provider={provider} />

      {/* Cluster footer */}
      <div className="cluster-footer">
        <span className="cluster-badge">
          🔗 {articles.length} articles on this story
          {sharedKeywords.length > 0 && (
            <span className="cluster-keywords">
              {' '}· {sharedKeywords.slice(0, 3).join(', ')}
            </span>
          )}
        </span>
        <button
          className="cluster-toggle-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? '▲ Show less' : `▼ Show ${rest.length} more`}
        </button>
      </div>

      {expanded && (
        <div className="cluster-related">
          {rest.map((article, i) => (
            <LiveCard
              key={article.url}
              article={article}
              index={baseIndex + i + 1}
              model={model}
              provider={provider}
            />
          ))}
        </div>
      )}
    </div>
  )
}
