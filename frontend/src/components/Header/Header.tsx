import { useState } from 'react'
import { useProviders } from '../../hooks/useProviders'
import { useTTS } from '../../contexts/TTSContext'

interface HeaderProps {
  className?: string
}

function voiceLabel(v: SpeechSynthesisVoice): string {
  const name = v.name
  if (/neural|premium/i.test(name)) return `⭐ ${name}`
  if (/enhanced|natural/i.test(name)) return `✨ ${name}`
  return name
}

function qualityRank(v: SpeechSynthesisVoice): number {
  if (/neural|premium/i.test(v.name)) return 0
  if (/enhanced|natural/i.test(v.name)) return 1
  return 2
}

export function Header({ className }: HeaderProps) {
  const { providers } = useProviders()
  const { voices, selectedVoice, setSelectedVoice } = useTTS()
  const [model, setModel] = useState('llama-3.3-70b-versatile')
  const [theme, setTheme] = useState('dark')

  const models = providers.groq ?? ['llama-3.3-70b-versatile']

  // English voices sorted by quality tier then name
  const englishVoices = voices
    .filter((v) => /en[-_]/i.test(v.lang))
    .sort((a, b) => qualityRank(a) - qualityRank(b) || a.name.localeCompare(b.name))

  const applyTheme = (t: string) => {
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
  }

  return (
    <header className={`app-header ${className ?? ''}`} data-testid="app-header">
      <div className="app-logo" aria-hidden="true">⚡</div>
      <h1 className="app-title">PulseWire</h1>
      <span className="app-badge">AI</span>
      <span className="app-free-badge">Free</span>

      <div className="app-header-right">
        <select
          id="model-select"
          className="app-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="AI model"
        >
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {englishVoices.length > 0 && (
          <>
            <label htmlFor="voice-select" className="header-label">Voice:</label>
            <select
              id="voice-select"
              className="app-select"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              aria-label="TTS voice"
            >
              <option value="">🔊 Auto (best)</option>
              {englishVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {voiceLabel(v)}
                </option>
              ))}
            </select>
          </>
        )}

        <select
          id="theme-select"
          className="app-select"
          value={theme}
          onChange={(e) => applyTheme(e.target.value)}
          aria-label="Color theme"
        >
          <option value="dark">🌑 Dark</option>
          <option value="light">⬜ Light</option>
          <option value="grey">🔘 Grey</option>
        </select>
      </div>
    </header>
  )
}
