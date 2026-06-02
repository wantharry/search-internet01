import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LiveCard } from '../components/LiveNews/LiveCard'
import { TTSProvider } from '../contexts/TTSContext'
import type { Article } from '../types'

vi.mock('../api/client', () => ({
  streamSearch: vi.fn(() => () => {}),
}))

const MOCK_ARTICLE: Article = {
  title: 'OpenAI releases GPT-5',
  url: 'https://openai.com/blog/gpt-5',
  source: 'OpenAI Blog',
  published: new Date(Date.now() - 3600 * 1000).toISOString(),
  snippet: 'OpenAI has released GPT-5 with improved reasoning.',
  topic: 'AI',
  importance: 'high',
  score: 4,
}

function renderCard(article: Article = MOCK_ARTICLE) {
  return render(
    <TTSProvider>
      <LiveCard article={article} index={0} model="llama-3.3-70b-versatile" provider="groq" />
    </TTSProvider>,
  )
}

describe('LiveCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders article title', () => {
    renderCard()
    expect(screen.getByText('OpenAI releases GPT-5')).toBeInTheDocument()
  })

  it('renders source name', () => {
    renderCard()
    expect(screen.getByText(/OpenAI Blog/)).toBeInTheDocument()
  })

  it('renders link to article', () => {
    renderCard()
    const link = screen.getByTestId('card-title-link')
    expect(link).toHaveAttribute('href', 'https://openai.com/blog/gpt-5')
  })

  it('renders snippet', () => {
    renderCard()
    expect(screen.getByText(/improved reasoning/)).toBeInTheDocument()
  })

  it('renders topic badge', () => {
    renderCard()
    expect(screen.getByTestId('topic-badge')).toHaveTextContent('AI')
  })

  it('has summarize button', () => {
    renderCard()
    expect(screen.getByTestId('summarize-btn')).toBeInTheDocument()
  })

  it('has TTS button', () => {
    renderCard()
    expect(screen.getByTestId('live-tts-btn')).toBeInTheDocument()
  })

  it('renders 5 star buttons', () => {
    renderCard()
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`star-${i}`)).toBeInTheDocument()
    }
  })

  it('updates star rating on click', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByTestId('star-3'))
    expect(screen.getByTestId('star-3')).toHaveClass('active')
  })

  it('applies breaking class for breaking importance', () => {
    renderCard({ ...MOCK_ARTICLE, importance: 'breaking' })
    expect(screen.getByTestId('live-card')).toHaveClass('breaking')
  })

  it('applies high class for high importance', () => {
    renderCard({ ...MOCK_ARTICLE, importance: 'high' })
    expect(screen.getByTestId('live-card')).toHaveClass('high')
  })

  it('activates TTS on button click', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByTestId('live-tts-btn'))
    expect(window.speechSynthesis.speak).toHaveBeenCalled()
  })
})
