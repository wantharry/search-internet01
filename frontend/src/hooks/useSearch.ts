import { useCallback, useReducer, useRef } from 'react'
import { streamSearch } from '../api/client'
import type { SearchRequest, SearchState, SummaryDepth } from '../types'

const DEPTHS: SummaryDepth[] = ['ultra_short', 'summary', 'detailed']

function makeEmptySummaries(): SearchState['summaries'] {
  const make = (depth: SummaryDepth, label: string) => ({
    depth,
    label,
    text: '',
    streaming: false,
    done: false,
  })
  return {
    ultra_short: make('ultra_short', 'TL;DR'),
    summary: make('summary', 'Summary'),
    detailed: make('detailed', 'Detailed'),
  }
}

const initialState: SearchState = {
  status: '',
  progress: '',
  results: [],
  summaries: makeEmptySummaries(),
  isSearching: false,
  isDone: false,
  error: null,
  total: 0,
}

type Action =
  | { type: 'START' }
  | { type: 'STATUS'; message: string }
  | { type: 'RESULT'; result: SearchState['results'][0] }
  | { type: 'PROGRESS'; progress: string }
  | { type: 'SUMMARY_START'; depth: SummaryDepth; label: string }
  | { type: 'SUMMARY_CHUNK'; depth: SummaryDepth; text: string }
  | { type: 'SUMMARY_DONE'; depth: SummaryDepth }
  | { type: 'DONE'; total: number }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' }

function reducer(state: SearchState, action: Action): SearchState {
  switch (action.type) {
    case 'START':
      return { ...initialState, isSearching: true, summaries: makeEmptySummaries() }
    case 'STATUS':
      return { ...state, status: action.message }
    case 'RESULT':
      return { ...state, results: [...state.results, action.result], progress: state.progress }
    case 'PROGRESS':
      return { ...state, progress: action.progress }
    case 'SUMMARY_START':
      return {
        ...state,
        summaries: {
          ...state.summaries,
          [action.depth]: { ...state.summaries[action.depth], label: action.label, streaming: true, text: '' },
        },
      }
    case 'SUMMARY_CHUNK':
      return {
        ...state,
        summaries: {
          ...state.summaries,
          [action.depth]: {
            ...state.summaries[action.depth],
            text: state.summaries[action.depth].text + action.text,
          },
        },
      }
    case 'SUMMARY_DONE':
      return {
        ...state,
        summaries: {
          ...state.summaries,
          [action.depth]: { ...state.summaries[action.depth], streaming: false, done: true },
        },
      }
    case 'DONE':
      return { ...state, isSearching: false, isDone: true, total: action.total }
    case 'ERROR':
      return { ...state, isSearching: false, error: action.message }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export function useSearch() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const cancelRef = useRef<(() => void) | null>(null)

  const search = useCallback((req: SearchRequest) => {
    if (cancelRef.current) cancelRef.current()
    dispatch({ type: 'START' })

    cancelRef.current = streamSearch(
      req,
      (evt) => {
        switch (evt.type) {
          case 'status':
            dispatch({ type: 'STATUS', message: evt.message as string })
            break
          case 'result':
            dispatch({ type: 'RESULT', result: evt.result as SearchState['results'][0] })
            dispatch({ type: 'PROGRESS', progress: evt.progress as string })
            break
          case 'summary_start':
            dispatch({
              type: 'SUMMARY_START',
              depth: evt.depth as SummaryDepth,
              label: evt.label as string,
            })
            break
          case 'summary_chunk':
            dispatch({
              type: 'SUMMARY_CHUNK',
              depth: evt.depth as SummaryDepth,
              text: evt.text as string,
            })
            break
          case 'summary_done':
            dispatch({ type: 'SUMMARY_DONE', depth: evt.depth as SummaryDepth })
            break
          case 'done':
            dispatch({ type: 'DONE', total: evt.total as number })
            break
          case 'error':
            dispatch({ type: 'ERROR', message: evt.message as string })
            break
        }
      },
      (err) => dispatch({ type: 'ERROR', message: err }),
      () => {},
    )
  }, [])

  const cancel = useCallback(() => {
    cancelRef.current?.()
    dispatch({ type: 'RESET' })
  }, [])

  const availableDepths = DEPTHS.filter((d) => state.summaries[d].done || state.summaries[d].streaming)

  return { state, search, cancel, availableDepths }
}
