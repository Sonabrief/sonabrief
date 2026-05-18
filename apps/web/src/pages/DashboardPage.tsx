import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, logout, getBillingStatus, getBillingPortalUrl, getPreferences, type BillingStatus } from '../lib/api'
import { Button } from '../components/ui/button'

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  unlimited: 'Pro Unlimited',
}

const TIER_COLOR: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  pro: 'bg-teal-50 text-teal-700 border border-teal-200',
  unlimited: 'bg-amber-50 text-amber-700 border border-amber-200',
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getMe().then(user => {
      if (user) setEmail(user.email)
    })
    getBillingStatus().then(b => {
      if (b) setBilling(b)
    })
    getPreferences().then(prefs => {
      if (prefs && prefs.onboarded === 0) {
        navigate('/onboarding')
      } else {
        setOnboarded(true)
      }
    })
  }, [])

  async function handleManageSubscription() {
    const url = await getBillingPortalUrl()
    if (url) window.open(url, '_blank')
  }

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  if (onboarded === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
        <p className="text-sm text-gray-400">Caricamento...</p>
      </div>
    )
  }

  const tier = billing?.tier ?? 'free'
  const used = billing?.quota_used_minutes ?? 0
  const cap = billing?.quota_cap_minutes ?? 300
  const remaining = Math.max(0, cap - used)
  const percentUsed = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">

        <h1
          className="text-3xl text-[#1A4D52]"
          style={{ fontFamily: '"Instrument Serif", serif' }}
        >
          Sonabrief
        </h1>

        {email && (
          <p className="text-sm text-gray-500">{email}</p>
        )}

        {/* Badge tier */}
        <div className="flex items-center justify-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${TIER_COLOR[tier] ?? TIER_COLOR.free}`}>
            {TIER_LABEL[tier] ?? tier}
          </span>
          {billing?.billing_cycle && (
            <span className="text-xs text-gray-400">
              {billing.billing_cycle === 'monthly' ? 'mensile' : 'annuale'}
            </span>
          )}
        </div>

        {/* Quota residua — solo per free e pro */}
        {tier !== 'unlimited' && billing && (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Sintesi cloud questo mese</span>
              <span className="text-xs font-medium text-gray-700">
                {formatMinutes(remaining)} rimanenti
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  percentUsed > 80 ? 'bg-red-400' : 'bg-[#1A4D52]'
                }`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              {formatMinutes(used)} usati su {formatMinutes(cap)}
            </p>
          </div>
        )}

        {/* Unlimited badge */}
        {tier === 'unlimited' && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-5 py-3 text-center">
            <p className="text-xs text-amber-700">Sintesi cloud illimitata ✓</p>
          </div>
        )}

        {/* Link upgrade — solo per free */}
        {tier === 'free' && (
          <button
            onClick={() => navigate('/pricing')}
            className="text-sm text-[#1A4D52] underline hover:text-[#143a3e]"
          >
            Passa a Pro →
          </button>
        )}

        <div className="space-y-3 pt-2">
          <Button
            onClick={() => navigate('/recording')}
            className="w-full bg-[#1A4D52] hover:bg-[#143a3e] text-white"
          >
            + Nuovo meeting
          </Button>

          <button
            onClick={() => navigate('/archive')}
            className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-gray-300 transition-colors"
          >
            Archivio meeting
          </button>

          {tier !== 'free' && (
            <button
              onClick={handleManageSubscription}
              className="text-xs text-gray-400 underline"
            >
              Gestisci abbonamento
            </button>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 underline"
        >
          Esci
        </button>

      </div>
    </div>
  )
}
