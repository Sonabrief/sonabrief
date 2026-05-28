import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getHardwareTier } from '../lib/whisperModel'
import { Button } from './ui/button'

interface HardwareSuggestionModalProps {
  onTryCloud: () => void
  onContinueLocal: () => void
}

export function HardwareSuggestionModal({ onTryCloud, onContinueLocal }: HardwareSuggestionModalProps) {
  const { t } = useTranslation()
  const [visible] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    if (localStorage.getItem('sb_hw_modal_shown')) return false
    return getHardwareTier() !== 'fast'
  })
  const [open, setOpen] = useState(visible)

  if (!open) return null

  function handleTryCloud() {
    localStorage.setItem('sb_hw_modal_shown', '1')
    setOpen(false)
    onTryCloud()
  }

  function handleContinueLocal() {
    localStorage.setItem('sb_hw_modal_shown', '1')
    setOpen(false)
    onContinueLocal()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background shadow-xl p-6 space-y-4">
        <h2 className="font-heading text-lg font-bold text-foreground">
          {t('hardware.modalTitle')}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t('hardware.modalBody')}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleTryCloud} className="w-full rounded-md hover:bg-(--primary-hover)">
            {t('hardware.modalCta')}
          </Button>
          <button
            onClick={handleContinueLocal}
            className="w-full text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            {t('hardware.modalSkip')}
          </button>
        </div>
      </div>
    </div>
  )
}
