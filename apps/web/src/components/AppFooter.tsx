import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function AppFooter() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-border mt-auto py-4 px-6">
      <div className="mx-auto max-w-6xl flex items-center gap-4">
        <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {t('app_nav.privacy_policy')}
        </Link>
        <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          {t('app_nav.terms')}
        </Link>
      </div>
    </footer>
  )
}