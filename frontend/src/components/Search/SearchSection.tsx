import { useState } from 'react'
import { useSearch } from '../../hooks/useSearch'
import { useProviders } from '../../hooks/useProviders'
import { SearchCard } from './SearchCard'
import { SummaryCard } from './SummaryCard'
import { ResultCard } from './ResultCard'
import type { SearchRequest } from '../../types'

export function SearchSection() {
  const { state, search, cancel, availableDepths } = useSearch()
  const { providers } = useProviders()
  const [provider, setProvider] = useState('groq')
  const [model, setModel] = useState('llama-3.3-70b-versatile')

  const handleSearch = (params: Omit<SearchRequest, 'model' | 'provider'>) => {
    search({ ...params, model, provider })
  }

  const progressPct = state.progress
    ? Math.round(
        (parseInt(state.progress.split('/')[0]) /
          parseInt(state.progress.split('/')[1])) *
          100,
      )
    : 0

  return (
    <section id="panel-search" role="tabpanel" aria-label="Search">
      <SearchCard
        onSearch={handleSearch}
        isSearching={state.isSearching}
        onCancel={cancel}
        provider={provider}
        model={model}
        providers={providers}
        onProviderChange={setProvider}
        onModelChange={setModel}
      />

      {state.isSearching && state.status && (
        <div className="status-bar" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <span>{state.status}</span>
        </div>
      )}

      {state.isSearching && state.progress && (
        <div className="progress-wrap" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {state.error && (
        <div className="status-bar" role="alert" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
          ⚠ {state.error}
        </div>
      )}

      {availableDepths.length > 0 && (
        <SummaryCard summaries={state.summaries} availableDepths={availableDepths} />
      )}

      {state.results.length > 0 && (
        <>
          <p className="results-header">
            {state.isDone
              ? `${state.results.length} results`
              : `${state.results.length} of ${state.progress.split('/')[1] ?? '?'} results`}
          </p>
          <div className="results-list" role="list">
            {state.results.map((r) => (
              <ResultCard key={r.url || r.index} result={r} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
