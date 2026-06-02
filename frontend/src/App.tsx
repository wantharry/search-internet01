import { useState } from 'react'
import { TTSProvider } from './contexts/TTSContext'
import { Header } from './components/Header/Header'
import { NavTabs } from './components/NavTabs/NavTabs'
import { SearchSection } from './components/Search/SearchSection'
import { LiveSection } from './components/LiveNews/LiveSection'
import { AlertsSection } from './components/Alerts/AlertsSection'
import { TTSStopPill } from './components/common/TTSStopPill'
import type { Tab } from './types'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('live')
  const [alertUnread, setAlertUnread] = useState(0)

  return (
    <TTSProvider>
      <Header />
      <main className="app-main">
        <NavTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          alertUnread={alertUnread}
        />

        {activeTab === 'search' && <SearchSection />}
        {activeTab === 'live' && <LiveSection />}
        {activeTab === 'alerts' && (
          <AlertsSection onUnreadChange={setAlertUnread} />
        )}
      </main>
      <TTSStopPill />
    </TTSProvider>
  )
}
