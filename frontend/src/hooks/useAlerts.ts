import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveFeed } from '../api/client'
import type { Alert, Article } from '../types'

const POLL_INTERVAL = 90_000 // 90 s
const MAX_ALERTS = 150

function articleToAlert(a: Article): Alert {
  return {
    ...a,
    id: a.url,
    read: false,
    fetchedAt: new Date(),
  }
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [status, setStatus] = useState('Starting up…')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const seenUrls = useRef<Set<string>>(new Set())
  const audioRef = useRef<AudioContext | null>(null)
  const soundRef = useRef(soundEnabled)
  soundRef.current = soundEnabled

  const playBeep = useCallback(() => {
    if (!soundRef.current) return
    try {
      const ctx = (audioRef.current ??= new AudioContext())
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start()
      osc.stop(ctx.currentTime + 0.4)
    } catch {
      // AudioContext unavailable in test environment
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    const cats = ['breaking']
    let newItems: Alert[] = []
    for (const cat of cats) {
      try {
        const data = await getLiveFeed(cat)
        const items = ((data as { items?: Article[] }).items ?? [])
          .filter((a: Article) => !seenUrls.current.has(a.url))
          .map(articleToAlert)
        items.forEach((a) => seenUrls.current.add(a.url))
        newItems = [...newItems, ...items]
      } catch {
        // skip failed feed
      }
    }

    if (newItems.length > 0) {
      setAlerts((prev) => [...newItems, ...prev].slice(0, MAX_ALERTS))
      setUnreadCount((c) => c + newItems.length)
      if (newItems.some((a) => a.importance === 'breaking')) playBeep()
    }
    setStatus(`Updated ${new Date().toLocaleTimeString()}`)
  }, [playBeep])

  useEffect(() => {
    void fetchAlerts()
    const id = setInterval(() => void fetchAlerts(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchAlerts])

  const markAllRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })))
    setUnreadCount(0)
  }, [])

  const dismiss = useCallback((url: string) => {
    setAlerts((prev) => {
      const alert = prev.find((a) => a.url === url)
      if (alert && !alert.read) setUnreadCount((c) => Math.max(0, c - 1))
      return prev.filter((a) => a.url !== url)
    })
  }, [])

  const clearAll = useCallback(() => {
    setAlerts([])
    setUnreadCount(0)
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled((v) => !v)
  }, [])

  return {
    alerts,
    unreadCount,
    status,
    soundEnabled,
    markAllRead,
    dismiss,
    clearAll,
    toggleSound,
  }
}
