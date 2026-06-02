import type { Tab } from '../../types'

interface NavTabsProps {
  activeTab: Tab
  onChange: (tab: Tab) => void
  alertUnread?: number
  savedCount?: number
}

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'search', icon: '🔍', label: 'Search' },
  { id: 'live',   icon: '📡', label: 'Live' },
  { id: 'alerts', icon: '🔔', label: 'Alerts' },
  { id: 'saved',  icon: '★', label: 'Saved' },
]

export function NavTabs({ activeTab, onChange, alertUnread = 0, savedCount = 0 }: NavTabsProps) {
  return (
    <nav className="nav-pill-bar" role="tablist" aria-label="Main navigation">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          className={`nav-pill-tab${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
          data-testid={`nav-tab-${tab.id}`}
        >
          <span className="nav-tab-icon" aria-hidden="true">{tab.icon}</span>
          <span className="nav-tab-label">{tab.label}</span>
          {tab.id === 'alerts' && alertUnread > 0 && (
            <span className="nav-badge" aria-label={`${alertUnread} unread alerts`}>
              {alertUnread > 99 ? '99+' : alertUnread}
            </span>
          )}
          {tab.id === 'saved' && savedCount > 0 && (
            <span className="nav-badge" style={{ background: '#f59e0b' }} aria-label={`${savedCount} saved`}>
              {savedCount > 99 ? '99+' : savedCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
