import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'

interface TTSState {
  isSpeaking: boolean
  label: string
}

interface TTSContextValue {
  isSpeaking: boolean
  label: string
  voices: SpeechSynthesisVoice[]
  selectedVoice: string
  setSelectedVoice: (v: string) => void
  speak: (text: string, label: string) => void
  stop: () => void
}

const TTSContext = createContext<TTSContextValue | null>(null)

export function TTSProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TTSState>({ isSpeaking: false, label: '' })
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState('')
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Load voices (may arrive async)
  React.useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis?.getVoices() ?? []
      if (v.length) setVoices(v)
    }
    load()
    window.speechSynthesis?.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load)
  }, [])

  const stop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.pause()   // Chrome bug: cancel() alone may not stop mid-speech
      window.speechSynthesis.cancel()
    }
    utteranceRef.current = null
    setState({ isSpeaking: false, label: '' })
  }, [])

  const cleanText = (raw: string) =>
    raw
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/#+\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

  const speak = useCallback(
    (text: string, label: string) => {
      if (!window.speechSynthesis) return
      stop()

      const clean = cleanText(text)
      const utt = new SpeechSynthesisUtterance(clean)
      utt.rate = 0.88
      utt.pitch = 1.0
      utt.volume = 1.0

      if (selectedVoice) {
        const match = voices.find((v) => v.name === selectedVoice)
        if (match) utt.voice = match
      } else {
        // Pick best natural-sounding voice
        const preferred = voices.find(
          (v) =>
            /natural|neural|premium|enhanced/i.test(v.name) &&
            /en[-_]/i.test(v.lang),
        )
        const english = voices.find((v) => /en[-_]US/i.test(v.lang))
        utt.voice = preferred ?? english ?? null
      }

      utt.onend = () => setState({ isSpeaking: false, label: '' })
      utt.onerror = () => setState({ isSpeaking: false, label: '' })

      utteranceRef.current = utt
      setState({ isSpeaking: true, label })
      setTimeout(() => { if (utteranceRef.current === utt) window.speechSynthesis.speak(utt) }, 100)
    },
    [stop, voices, selectedVoice],
  )

  return (
    <TTSContext.Provider
      value={{ isSpeaking: state.isSpeaking, label: state.label, voices, selectedVoice, setSelectedVoice, speak, stop }}
    >
      {children}
    </TTSContext.Provider>
  )
}

export function useTTS() {
  const ctx = useContext(TTSContext)
  if (!ctx) throw new Error('useTTS must be used within TTSProvider')
  return ctx
}
