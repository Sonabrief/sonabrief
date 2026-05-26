import { useTier } from '../hooks/useTier'
import { useTranslation } from 'react-i18next'

interface ProGateProps {
  children: React.ReactNode
  feature?: string
}

export function ProGate({ children, feature }: ProGateProps) {
  const { t } = useTranslation()
  const { isFree, loading } = useTier()
  const featureLabel = feature ?? t('pro_gate.default_feature')

  if (loading) return <>{children}</>

  if (isFree) {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-40 select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg p-4 shadow-lg text-center max-w-xs">
            <p className="font-heading text-sm font-semibold text-foreground mb-1">
              {t('pro_gate.locked', { feature: featureLabel })}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {t('pro_gate.hint')}
            </p>
            <a
              href="/pricing"
              className="inline-block bg-[#1A4D52] text-white text-xs font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
            >
              {t('pro_gate.see_plans')}
            </a>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}