import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SearchCard } from '../components/Search/SearchCard'
import type { Providers } from '../types'

const PROVIDERS: Providers = {
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  ollama: ['llama3.2'],
}

const DEFAULT_PROPS = {
  onSearch: vi.fn(),
  isSearching: false,
  onCancel: vi.fn(),
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  providers: PROVIDERS,
  onProviderChange: vi.fn(),
  onModelChange: vi.fn(),
}

describe('SearchCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders search input', () => {
    render(<SearchCard {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('search-input')).toBeInTheDocument()
  })

  it('renders search button', () => {
    render(<SearchCard {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('search-btn')).toBeInTheDocument()
  })

  it('disables search button when query is empty', () => {
    render(<SearchCard {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('search-btn')).toBeDisabled()
  })

  it('enables search button when query has text', async () => {
    const user = userEvent.setup()
    render(<SearchCard {...DEFAULT_PROPS} />)
    await user.type(screen.getByTestId('search-input'), 'react news')
    expect(screen.getByTestId('search-btn')).not.toBeDisabled()
  })

  it('calls onSearch with query on button click', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<SearchCard {...DEFAULT_PROPS} onSearch={onSearch} />)
    await user.type(screen.getByTestId('search-input'), 'react query')
    await user.click(screen.getByTestId('search-btn'))
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'react query' }),
    )
  })

  it('calls onSearch when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<SearchCard {...DEFAULT_PROPS} onSearch={onSearch} />)
    await user.type(screen.getByTestId('search-input'), 'test{enter}')
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('shows Cancel button when isSearching=true', () => {
    render(<SearchCard {...DEFAULT_PROPS} isSearching={true} />)
    expect(screen.getByTestId('search-btn')).toHaveTextContent('Cancel')
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<SearchCard {...DEFAULT_PROPS} isSearching={true} onCancel={onCancel} />)
    await user.click(screen.getByTestId('search-btn'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('renders pages range slider', () => {
    render(<SearchCard {...DEFAULT_PROPS} />)
    expect(screen.getByLabelText(/Pages: \d+/)).toBeInTheDocument()
  })

  it('renders concurrency range slider', () => {
    render(<SearchCard {...DEFAULT_PROPS} />)
    expect(screen.getByLabelText(/Concurrency: \d+/)).toBeInTheDocument()
  })

  it('has mic button', () => {
    render(<SearchCard {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('mic-btn')).toBeInTheDocument()
  })

  it('renders model options for selected provider', () => {
    render(<SearchCard {...DEFAULT_PROPS} />)
    const modelSelect = screen.getByLabelText('AI model')
    expect(modelSelect).toHaveValue('llama-3.3-70b-versatile')
    expect(screen.getAllByRole('option', { name: 'llama-3.3-70b-versatile' }).length).toBeGreaterThan(0)
  })

  it('does not call onSearch when query is whitespace only', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<SearchCard {...DEFAULT_PROPS} onSearch={onSearch} />)
    await user.type(screen.getByTestId('search-input'), '   {enter}')
    expect(onSearch).not.toHaveBeenCalled()
  })
})
