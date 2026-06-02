import { useEffect, useState } from 'react'
import { getProviders } from '../api/client'
import type { Providers } from '../types'

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
]

export function useProviders() {
  const [providers, setProviders] = useState<Providers>({ groq: GROQ_MODELS, ollama: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProviders()
      .then(setProviders)
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false))
  }, [])

  return { providers, loading }
}
