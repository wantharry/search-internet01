import { useEffect, useRef } from 'react'
import { useAlerts } from '../../hooks/useAlerts'
import { AlertCard } from './AlertCard'

interface AlertsSectionProps {
  onUnreadChange?: (count: number) => void
}

export function AlertsSection({ onUnreadChange }: AlertsSectionProps) {
  const {
    alerts,
    unreadCount,
    status,
    soundEnabled,
    markAllRead,
    dismiss,
    clearAll,
    toggleSound,
  } = useAlerts()
  const model = 'llama-3.3-70b-versatile'

  const prevUnread = useRef(unreadCount)
  useEffect(() => {
    if (prevUnread.current !== unreadCount) {
      onUnreadChange?.(unreadCount)
      prevUnread.current = unreadCount
    }
  }, [unreadCount, onUnreadChange])

  return (
    <section id="panel-alerts" role="tabpanel" aria-label="Breaking news alerts">
      <div className="alerts-toolbar">
        <button
          className="alerts-ctrl-btn"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          data-testid="mark-all-read"
        >
          ✓ Mark all read
        </button>
        <button
          className="alerts-ctrl-btn"
          onClick={clearAll}
          disabled={alerts.length === 0}
          data-testid="clear-all"
        >
          🗑 Clear all
        </button>
        <button
          className={`alerts-sound-btn${soundEnabled ? ' on' : ''}`}
          onClick={toggleSound}
          aria-label={soundEnabled ? 'Disable alert sound' : 'Enable alert sound'}
          data-testid="sound-toggle"
        >
          {soundEnabled ? '🔔 Sound On' : '🔕 Sound Off'}
        </button>
        <span className="alerts-status" aria-live="polite">{status}</span>
      </div>

      <div className="alerts-stack" role="list" aria-label="News alerts" data-testid="alerts-list">
        {alerts.length === 0 && (
          <div className="alerts-empty">
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
            <p>No alerts yet — breaking news will appear here automatically.</p>
          </div>
        )}
        {alerts.map((alert) => (
          <AlertCard key={alert.url} alert={alert} onDismiss={dismiss} model={model} provider="groq" />
        ))}
      </div>
    </section>
  )
}
