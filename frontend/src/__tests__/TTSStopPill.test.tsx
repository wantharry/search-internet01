import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TTSStopPill } from '../components/common/TTSStopPill'
import { TTSProvider } from '../contexts/TTSContext'

// Helper that renders pill; to trigger TTS externally we test via TTSContext
function renderPill() {
  return render(
    <TTSProvider>
      <TTSStopPill />
    </TTSProvider>,
  )
}

describe('TTSStopPill', () => {
  it('is not visible when TTS is not speaking', () => {
    renderPill()
    expect(screen.queryByTestId('tts-stop-pill')).not.toBeInTheDocument()
  })
})
