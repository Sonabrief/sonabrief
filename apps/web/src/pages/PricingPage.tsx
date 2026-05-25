import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'

type Tier = 'pro_monthly' | 'pro_annual' | 'unlimited_monthly' | 'unlimited_annual'

interface PlanCard {
  name: string
  price: string
  cycle: string
  description: string
  features: string[]
  tier: Tier | null
  highlight?: boolean
}

export default function PricingPage() {
  const navigate = useNavigate()
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState<Tier | null>(null)
  const [error, setError] = useState<string | null>(null)

  const plans: PlanCard[] = [
    {
      name: 'Free',
      price: '€0',
      cycle: 'forever',
      description: 'Per provare Sonabrief senza impegno.',
      features: [
        '3 ore di sintesi cloud / mese',
        'Modalità Local Only illimitata',
        'Sync E2E fino a 100 MB',
        'Archivio 7 giorni',
        'Export solo Markdown',
      ],
      tier: null,
    },
    {
      name: 'Pro',
      price: billing === 'monthly' ? '€9' : '€89',
      cycle: billing === 'monthly' ? '/ mese' : '/ anno',
      description: 'Per il professionista che lavora ogni giorno con i clienti.',
      features: [
        '30 ore di sintesi cloud / mese',
        'Mistral Large 3 (EU-hosted)',
        'Sync E2E fino a 5 GB',
        'Dashboard action items',
        'Briefing pre-meeting',
        'Template personalizzati (5)',
        'Archivio sintesi 12 mesi',
      ],
      tier: billing === 'monthly' ? 'pro_monthly' : 'pro_annual',
      highlight: true,
    },
    {
      name: 'Pro Unlimited',
      price: billing === 'monthly' ? '€19' : '€189',
      cycle: billing === 'monthly' ? '/ mese' : '/ anno',
      description: 'Per chi gestisce volumi alti senza limiti.',
      features: [
        'Sintesi cloud illimitata',
        'Mistral Large 3 (EU-hosted)',
        'Sync E2E fino a 25 GB',
        'Backup automatico',
        'Template personalizzati illimitati',
        'Supporto prioritario',
        'Archivio sintesi illimitato',
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
      setError(e instanceof Error ? e.message : 'Errore imprevisto')
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
            ← Dashboard
          </button>
        </div>

        <div className="mb-12 text-center">
          <h1
            className="text-5xl text-[#1A4D52]"
            style={{ fontFamily: '"Instrument Serif", serif' }}
          >
            Scegli il tuo piano
          </h1>
          <p className="mt-4 text-base text-gray-600">
            Cambialo o cancellalo quando vuoi. Nessun lock-in.
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
              Mensile
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`rounded-full px-5 py-2 text-sm transition ${
                billing === 'annual'
                  ? 'bg-[#1A4D52] text-white'
                  : 'text-gray-600'
              }`}
            >
              Annuale
              <span className="ml-2 rounded-full bg-[#C89868] px-2 py-0.5 text-xs text-white">
                -17%
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
                  Più scelto
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

              <ul className="mt-6 flex flex-col gap-2">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1 text-[#1A4D52]">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {plan.tier ? (
                  <button
                    onClick={() => handleUpgrade(plan.tier!)}
                    disabled={loading !== null}
                    className={`w-full rounded-lg px-4 py-3 text-sm font-medium transition ${
                      plan.highlight
                        ? 'bg-[#1A4D52] text-white hover:bg-[#143a3e]'
                        : 'border border-[#1A4D52] text-[#1A4D52] hover:bg-[#1A4D52] hover:text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loading === plan.tier ? 'Caricamento...' : 'Inizia ora'}
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-400 cursor-default"
                  >
                    Piano attuale
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-xs text-gray-500">
          Pagamenti gestiti da Polar (Merchant of Record). IVA inclusa automaticamente.
        </p>
      </div>
    </div>
  )
}
