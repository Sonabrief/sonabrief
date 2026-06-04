import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { API_URL } from '../config'
import { useTier } from '../hooks/useTier'

type Tier = 'pro_monthly' | 'pro_annual' | 'unlimited_monthly' | 'unlimited_annual'

interface PlanCard {
  name: string
  price: string
  cycle: string
  description: string
  features: string[]
  intro?: string
  tier: Tier | null
  highlight?: boolean
}

const TIER_ORDER: Record<string, number> = { free: 0, pro: 1, unlimited: 2 }

// plan.tier è Tier | null (pro_monthly | pro_annual | unlimited_monthly | unlimited_annual | null)
function planFamily(cardTier: Tier | null): 'free' | 'pro' | 'unlimited' {
  if (!cardTier) return 'free'
  if (cardTier.startsWith('pro_')) return 'pro'
  return 'unlimited'
}

export default function PricingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tier: userTier, loading: tierLoading } = useTier()
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState<Tier | null>(null)
  const [error, setError] = useState<string | null>(null)

  const plans: PlanCard[] = [
    {
      name: 'Free',
      price: '€0',
      cycle: t('pricing.cycle_forever'),
      description: t('pricing.free_desc'),
      features: [
        t('pricing.free_feature_1'),
        t('pricing.free_feature_2'),
        t('pricing.free_feature_3'),
        t('pricing.free_feature_4'),
        t('pricing.free_feature_5'),
      ],
      tier: null,
    },
    {
      name: 'Pro',
      price: billing === 'monthly' ? '€9' : '€89',
      cycle: billing === 'monthly' ? t('pricing.per_month') : t('pricing.per_year'),
      description: t('pricing.pro_desc'),
      features: [
        t('pricing.pro_feature_1'),
        t('pricing.pro_feature_cloud'),
        t('pricing.pro_feature_2'),
        t('pricing.pro_feature_3'),
        t('pricing.pro_feature_4'),
        t('pricing.pro_feature_5'),
        t('pricing.pro_feature_6'),
        t('pricing.pro_feature_7'),
      ],
      tier: billing === 'monthly' ? 'pro_monthly' : 'pro_annual',
      highlight: true,
    },
    {
      name: 'Pro Unlimited',
      price: billing === 'monthly' ? '€19' : '€189',
      cycle: billing === 'monthly' ? t('pricing.per_month') : t('pricing.per_year'),
      description: t('pricing.unlimited_desc'),
      intro: t('pricing.unlimited_intro'),
      features: [
        t('pricing.unlimited_feature_archive'),
        t('pricing.unlimited_feature_1'),
        t('pricing.unlimited_feature_cloud'),
        t('pricing.unlimited_feature_3'),
        t('pricing.unlimited_feature_4'),
        t('pricing.unlimited_feature_2'),
        t('pricing.unlimited_feature_5'),
      ],
      tier: billing === 'monthly' ? 'unlimited_monthly' : 'unlimited_annual',
    },
  ]

  async function handleUpgrade(tier: Tier) {
    setLoading(tier)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/v1/checkout/polar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      if (res.status === 401) {
        navigate('/')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error ?? 'checkout_failed')
      }
      const data = await res.json() as { url: string }
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pricing.error_unexpected'))
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F0] px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-gray-500 underline hover:text-[#1A4D52]"
          >
            {t('pricing.back')}
          </button>
        </div>

        <div className="mb-12 text-center">
          <h1
            className="text-5xl text-[#1A4D52]"
            style={{ fontFamily: '"Instrument Serif", serif' }}
          >
            {t('pricing.title')}
          </h1>
          <p className="mt-4 text-base text-gray-600">
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="mb-10 flex justify-center">
          <div className="inline-flex rounded-full border border-gray-200 bg-white p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`rounded-full px-5 py-2 text-sm transition ${
                billing === 'monthly'
                  ? 'bg-[#1A4D52] text-white'
                  : 'text-gray-600'
              }`}
            >
              {t('pricing.monthly')}
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`rounded-full px-5 py-2 text-sm transition ${
                billing === 'annual'
                  ? 'bg-[#1A4D52] text-white'
                  : 'text-gray-600'
              }`}
            >
              {t('pricing.annual')}
              <span className="ml-2 rounded-full bg-[#C89868] px-2 py-0.5 text-xs text-white">
                {t('pricing.annual_discount')}
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border bg-white p-8 ${
                plan.highlight
                  ? 'border-[#1A4D52] shadow-lg'
                  : 'border-gray-200'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#C89868] px-3 py-1 text-xs font-medium text-white">
                  {t('pricing.most_popular')}
                </div>
              )}
              <h2
                className="text-3xl text-[#1A4D52]"
                style={{ fontFamily: '"Instrument Serif", serif' }}
              >
                {plan.name}
              </h2>
              <p className="mt-2 text-sm text-gray-600">{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-medium text-gray-900">
                  {plan.price}
                </span>
                <span className="text-sm text-gray-500">{plan.cycle}</span>
              </div>

              {plan.intro && (
                <p className="mt-6 -mb-2 text-sm font-semibold text-gray-900">{plan.intro}</p>
              )}
              <ul className="mt-6 flex flex-col gap-2">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 text-[#1A4D52]">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {tierLoading ? (
                  <div className="w-full rounded-lg border border-gray-200 px-4 py-3 h-11.5 animate-pulse bg-gray-100" />
                ) : (() => {
                  const family = planFamily(plan.tier)
                  const userOrder = TIER_ORDER[userTier]
                  const planOrder = TIER_ORDER[family]
                  if (family === userTier) {
                    return (
                      <button
                        disabled
                        className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-400 cursor-default"
                      >
                        {t('pricing.current_plan')}
                      </button>
                    )
                  }
                  if (planOrder < userOrder) {
                    return (
                      <button
                        disabled
                        className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-400 cursor-default"
                      >
                        {t('pricing.included_in_plan')}
                      </button>
                    )
                  }
                  return plan.tier ? (
                    <button
                      onClick={() => handleUpgrade(plan.tier!)}
                      disabled={loading !== null}
                      className={`w-full rounded-lg px-4 py-3 text-sm font-medium transition ${
                        plan.highlight
                          ? 'bg-[#1A4D52] text-white hover:bg-[#143a3e]'
                          : 'border border-[#1A4D52] text-[#1A4D52] hover:bg-[#1A4D52] hover:text-white'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {loading === plan.tier ? t('pricing.loading') : t('pricing.start_now')}
                    </button>
                  ) : null
                })()}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-xs text-gray-500">
          {t('pricing.payment_note')}
        </p>
      </div>
    </div>
  )
}
