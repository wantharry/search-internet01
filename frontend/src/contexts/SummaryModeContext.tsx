import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

type SummaryMode = 'paragraph' | 'bullets'

interface SummaryModeCtx {
  mode: SummaryMode
  toggle: () => void
}

const Ctx = createContext<SummaryModeCtx | null>(null)

export function SummaryModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<SummaryMode>('paragraph')
  const toggle = () => setMode((m) => (m === 'paragraph' ? 'bullets' : 'paragraph'))
  return <Ctx.Provider value={{ mode, toggle }}>{children}</Ctx.Provider>
}

export function useSummaryMode(): SummaryModeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSummaryMode must be used inside SummaryModeProvider')
  return ctx
}
