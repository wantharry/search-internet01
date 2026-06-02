import '@testing-library/jest-dom'

// Mock SpeechSynthesis
const mockSynth = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => []),
  speaking: false,
  paused: false,
  pending: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onvoiceschanged: null,
}
Object.defineProperty(window, 'speechSynthesis', { value: mockSynth, writable: true })
Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: vi.fn().mockImplementation(() => ({
    text: '',
    lang: '',
    rate: 1,
    pitch: 1,
    volume: 1,
    voice: null,
    onend: null,
    onerror: null,
    onstart: null,
    addEventListener: vi.fn(),
  })),
  writable: true,
})

// Mock SpeechRecognition
Object.defineProperty(window, 'SpeechRecognition', { value: undefined, writable: true })
Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, writable: true })

// Mock AudioContext
Object.defineProperty(window, 'AudioContext', {
  value: vi.fn(() => ({
    createOscillator: vi.fn(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    })),
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    })),
    destination: {},
    currentTime: 0,
  })),
  writable: true,
})

// Mock fetch globally — tests override per-case
global.fetch = vi.fn()
