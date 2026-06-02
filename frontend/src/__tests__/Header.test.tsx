import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Header } from '../components/Header/Header'
import { TTSProvider } from '../contexts/TTSContext'

vi.mock('../hooks/useProviders', () => ({
  useProviders: () => ({
    providers: {
      groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
      ollama: ['llama3.2', 'mistral'],
    },
    loading: false,
  }),
}))

function renderHeader() {
  return render(<TTSProvider><Header /></TTSProvider>)
}
describe('Header', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders logo and title', () => {
    renderHeader()
    expect(screen.getByText('PulseWire')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('shows provider and model selects', () => {
    renderHeader()
    expect(screen.getByLabelText('AI provider')).toBeInTheDocument()
    expect(screen.getByLabelText('AI model')).toBeInTheDocument()
  })

  it('shows theme select', () => {
    renderHeader()
    expect(screen.getByLabelText('Color theme')).toBeInTheDocument()
  })

  it('changes provider and resets model', async () => {
    const user = userEvent.setup()
    renderHeader()
    const providerSel = screen.getByLabelText('AI provider')
    await user.selectOptions(providerSel, 'ollama')
    expect(providerSel).toHaveValue('ollama')
    expect(screen.getByLabelText('AI model')).toHaveValue('llama3.2')
  })

  it('applies theme to document element', async () => {
    const user = userEvent.setup()
    renderHeader()
    const themeSelect = screen.getByLabelText('Color theme')
    await user.selectOptions(themeSelect, 'light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('has correct header test id', () => {
    renderHeader()
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
  })
})
