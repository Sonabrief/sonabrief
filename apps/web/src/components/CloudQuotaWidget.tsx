import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCloudQuota, fetchCloudCheckout, type QuotaInfo } from '../lib/transcribeCloud'

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

const PRO_PACKAGES = [
  { id: 'pro_5h',  label: '5h · €4' },
  { id: 'pro_15h', label: '15h · €9' },
  { id: 'pro_40h', label: '40h · €20' },
]
const PU_PACKAGES = [
  { id: 'pu_8h',  label: '8h · €4' },
  { id: 'pu_20h', label: '20h · €9' },
  { id: 'pu_55h', label: '55h · €20' },
]

export function CloudQuotaWidget() {
  const { t } = useTranslation()
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [buyingPkg, setBuyingPkg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetchCloudQuota().then(q => {
      setQuota(q)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh])

  if (!loaded || !quota) return null

  const totalIncluded = quota.minutesIncluded + quota.extraMinutesPurchased
  if (totalIncluded <= 0) return null

  const used = Math.min(quota.minutesUsed, totalIncluded)
  const percent = Math.round((quota.minutesUsed / totalIncluded) * 100)
  const clampedPercent = Math.min(100, Math.max(0, percent))

  const barColor = percent > 95
    ? 'bg-destructive'
    : percent >= 80
    ? 'bg-amber-500'
    : 'bg-primary'

  const usedHours = formatHours(used)
  const totalHours = formatHours(totalIncluded)
  const packages = quota.tier === 'unlimited' ? PU_PACKAGES : PRO_PACKAGES
  const showPackages = percent >= 80

  async function handleBuy(pkgId: string) {
    if (buyingPkg) return
    setBuyingPkg(pkgId)
    try {
      const url = await fetchCloudCheckout(pkgId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      // silently ignore — user can retry
    } finally {
      setBuyingPkg(null)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t('recording.cloud_quota_widget_title')}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clampedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${barColor}`}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t('recording.cloud_quota_format', { used: usedHours, total: totalHours })}
      </p>
      {showPackages && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t('recording.cloud_buy_extra_title')}
          </p>
          <div className="flex gap-1.5">
            {packages.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => handleBuy(pkg.id)}
                disabled={buyingPkg !== null}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buyingPkg === pkg.id ? '…' : pkg.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
