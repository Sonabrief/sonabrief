import { EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function PrivateModeWarning() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <img src="/logo.svg" alt="Sonabrief" className="mb-10 h-7 w-auto" />
      <EyeOff className="mb-6 h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-heading text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
        {t('private_mode.title')}
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t('private_mode.hint')}
      </p>
    </div>
  )
}
