import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCloudQuota, type QuotaInfo } from '../lib/transcribeCloud'

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

export function CloudQuotaWidget() {
  const { t } = useTranslation()
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetchCloudQuota().then(q => {
      setQuota(q)
      setLoaded(true)
    })
  }, [])

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
    </div>
  )
}
