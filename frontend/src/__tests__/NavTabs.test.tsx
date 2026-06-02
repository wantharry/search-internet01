import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NavTabs } from '../components/NavTabs/NavTabs'
import type { Tab } from '../types'

describe('NavTabs', () => {
  const tabs: Tab[] = ['search', 'live', 'alerts']

  it('renders all three tabs', () => {
    render(<NavTabs activeTab="live" onChange={() => {}} />)
    expect(screen.getByTestId('nav-tab-search')).toBeInTheDocument()
    expect(screen.getByTestId('nav-tab-live')).toBeInTheDocument()
    expect(screen.getByTestId('nav-tab-alerts')).toBeInTheDocument()
  })

  it('marks active tab with aria-selected', () => {
    render(<NavTabs activeTab="search" onChange={() => {}} />)
    const searchTab = screen.getByTestId('nav-tab-search')
    const liveTab = screen.getByTestId('nav-tab-live')
    expect(searchTab).toHaveAttribute('aria-selected', 'true')
    expect(liveTab).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange with correct tab on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NavTabs activeTab="live" onChange={onChange} />)
    await user.click(screen.getByTestId('nav-tab-search'))
    expect(onChange).toHaveBeenCalledWith('search')
  })

  it('shows alert badge when unread > 0', () => {
    render(<NavTabs activeTab="live" onChange={() => {}} alertUnread={5} />)
    expect(screen.getByLabelText('5 unread alerts')).toBeInTheDocument()
  })

  it('hides alert badge when unread is 0', () => {
    render(<NavTabs activeTab="live" onChange={() => {}} alertUnread={0} />)
    expect(screen.queryByLabelText(/unread alerts/)).not.toBeInTheDocument()
  })

  it('shows 99+ for large unread counts', () => {
    render(<NavTabs activeTab="live" onChange={() => {}} alertUnread={150} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('has role tablist', () => {
    render(<NavTabs activeTab="search" onChange={() => {}} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it.each(tabs)('clicking %s tab calls onChange(%s)', async (tab) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NavTabs activeTab="search" onChange={onChange} />)
    await user.click(screen.getByTestId(`nav-tab-${tab}`))
    expect(onChange).toHaveBeenCalledWith(tab)
  })
})
