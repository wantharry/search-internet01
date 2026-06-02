import { useState } from 'react'
import { TTSProvider } from './contexts/TTSContext'
import { BookmarksProvider, useBookmarksCtx } from './contexts/BookmarksContext'
import { Header } from './components/Header/Header'
import { NavTabs } from './components/NavTabs/NavTabs'
import { SearchSection } from './components/Search/SearchSection'
import { LiveSection } from './components/LiveNews/LiveSection'
import { AlertsSection } from './components/Alerts/AlertsSection'
import { SavedSection } from './components/Saved/SavedSection'
import { TTSStopPill } from './components/common/TTSStopPill'
import type { Tab } from './types'

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>('live')
  const [alertUnread, setAlertUnread] = useState(0)
  const { bookmarks } = useBookmarksCtx()

  return (
    <>
      <Header />
      <main className="app-main">
        <NavTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          alertUnread={alertUnread}
          savedCount={bookmarks.length}
        />

        {activeTab === 'search' && <SearchSection />}
        {activeTab === 'live' && <LiveSection />}
        {activeTab === 'alerts' && (
          <AlertsSection onUnreadChange={setAlertUnread} />
        )}
        {activeTab === 'saved' && <SavedSection />}
      </main>
      <TTSStopPill />
    </>
  )
}

export default function App() {
  return (
    <TTSProvider>
      <BookmarksProvider>
        <AppInner />
      </BookmarksProvider>
    </TTSProvider>
  )
}
