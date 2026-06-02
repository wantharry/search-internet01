import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AlertCard } from '../components/Alerts/AlertCard'
import { TTSProvider } from '../contexts/TTSContext'
import type { Alert } from '../types'

const MOCK_ALERT: Alert = {
  title: 'Earthquake in Turkey',
  url: 'https://bbc.com/news/earthquake-turkey',
  source: 'BBC News',
  snippet: '7.8 magnitude earthquake strikes southern Turkey.',
  importance: 'breaking',
  read: false,
  fetchedAt: new Date(),
}

const score = 0

function renderCard(props: Partial<Alert> = {}, onDismiss = vi.fn()) {
  return render(
    <TTSProvider>
      <AlertCard
        alert={{ ...MOCK_ALERT, score, ...props }}
        onDismiss={onDismiss}
        model="llama-3.3-70b-versatile"
        provider="groq"
      />
    </TTSProvider>,
  )
}

describe('AlertCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders alert title', () => {
    renderCard()
    expect(screen.getByText('Earthquake in Turkey')).toBeInTheDocument()
  })

  it('renders source', () => {
    renderCard()
    expect(screen.getByText('BBC News')).toBeInTheDocument()
  })

  it('renders snippet', () => {
    renderCard()
    expect(screen.getByText(/7.8 magnitude/)).toBeInTheDocument()
  })

  it('renders BREAKING badge for breaking alerts', () => {
    renderCard()
    expect(screen.getByTestId('breaking-badge')).toBeInTheDocument()
  })

  it('does not show BREAKING badge for normal alerts', () => {
    renderCard({ importance: 'normal' })
    expect(screen.queryByTestId('breaking-badge')).not.toBeInTheDocument()
  })

  it('calls onDismiss with URL on dismiss click', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    renderCard({}, onDismiss)
    await user.click(screen.getByTestId('alert-dismiss'))
    expect(onDismiss).toHaveBeenCalledWith(MOCK_ALERT.url)
  })

  it('has link to article', () => {
    renderCard()
    const link = screen.getByRole('link', { name: 'Earthquake in Turkey' })
    expect(link).toHaveAttribute('href', MOCK_ALERT.url)
  })

  it('has unread class when unread', () => {
    renderCard({ read: false })
    expect(screen.getByTestId('alert-card')).toHaveClass('unread')
  })

  it('does not have unread class when read', () => {
    renderCard({ read: true })
    expect(screen.getByTestId('alert-card')).not.toHaveClass('unread')
  })

  it('has breaking class for breaking alerts', () => {
    renderCard()
    expect(screen.getByTestId('alert-card')).toHaveClass('breaking')
  })

  it('renders summarize button', () => {
    renderCard()
    expect(screen.getByTestId('summarize-btn')).toBeInTheDocument()
  })
})
