import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  onDismiss: () => void
}

const DISMISSED_KEY = 'itp_warning_dismissed'

export function ITPWarningBanner({ onDismiss }: Props) {
  const { t } = useTranslation()
  if (localStorage.getItem(DISMISSED_KEY) === '1') return null

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    onDismiss()
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-400 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-start gap-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900">
            {t('itp_warning.title')}
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            {t('itp_warning.hint')}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-xs font-medium text-amber-700 underline hover:text-amber-900"
        >
          {t('itp_warning.dismiss')}
        </button>
      </div>
    </div>
  )
}
