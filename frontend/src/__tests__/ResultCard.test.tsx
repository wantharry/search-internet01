import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResultCard } from '../components/Search/ResultCard'
import { TTSProvider } from '../contexts/TTSContext'
import type { SearchResult } from '../types'

const MOCK_RESULT: SearchResult = {
  index: 0,
  title: 'React 19 Released',
  url: 'https://react.dev/blog/react-19',
  snippet: 'React 19 brings Actions, Server Components, and more.',
  content_length: 4200,
  score: 0.92,
}

function renderWithTTS(result: SearchResult = MOCK_RESULT) {
  return render(
    <TTSProvider>
      <ResultCard result={result} />
    </TTSProvider>,
  )
}

describe('ResultCard', () => {
  it('renders article title', () => {
    renderWithTTS()
    expect(screen.getByText('React 19 Released')).toBeInTheDocument()
  })

  it('renders link to article', () => {
    renderWithTTS()
    const link = screen.getByRole('link', { name: 'React 19 Released' })
    expect(link).toHaveAttribute('href', 'https://react.dev/blog/react-19')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders snippet', () => {
    renderWithTTS()
    expect(screen.getByText(/React 19 brings Actions/)).toBeInTheDocument()
  })

  it('shows truncated URL', () => {
    renderWithTTS()
    expect(screen.getByText(/react\.dev\/blog\/react-19/)).toBeInTheDocument()
  })

  it('renders content length tag', () => {
    renderWithTTS()
    expect(screen.getByText(/chars/)).toBeInTheDocument()
  })

  it('renders TTS button', () => {
    renderWithTTS()
    expect(screen.getByTestId('result-tts-btn')).toBeInTheDocument()
  })

  it('activates TTS on button click', async () => {
    const user = userEvent.setup()
    renderWithTTS()
    await user.click(screen.getByTestId('result-tts-btn'))
    expect(window.speechSynthesis.speak).toHaveBeenCalled()
  })

  it('shows no content-length tag when content_length is 0', () => {
    renderWithTTS({ ...MOCK_RESULT, content_length: 0 })
    expect(screen.queryByText(/chars/)).not.toBeInTheDocument()
  })

  it('skips snippet when empty', () => {
    renderWithTTS({ ...MOCK_RESULT, snippet: '' })
    expect(screen.queryByText(/React 19 brings/)).not.toBeInTheDocument()
  })
})
