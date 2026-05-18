import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBillingStatus } from '../lib/api'

export default function BillingSuccessPage() {
  const navigate = useNavigate()
  const [tier, setTier] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  // Polling: aspetta che il webhook aggiorni il tier (max 10 tentativi, ogni 2s)
  useEffect(() => {
    const interval = setInterval(async () => {
      const billing = await getBillingStatus()
      if (billing && billing.tier !== 'free') {
        setTier(billing.tier)
        clearInterval(interval)
      }
      setAttempts(a => {
        if (a >= 10) clearInterval(interval)
        return a + 1
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const tierLabel: Record<string, string> = {
    pro: 'Pro',
    unlimited: 'Pro Unlimited',
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0] px-6">
      <div className="w-full max-w-sm text-center space-y-6">

        <div className="text-5xl">✓</div>

        <h1
          className="text-3xl text-[#1A4D52]"
          style={{ fontFamily: '"Instrument Serif", serif' }}
        >
          Pagamento completato
        </h1>

        {tier ? (
          <p className="text-gray-600 text-sm">
            Il tuo piano <strong>{tierLabel[tier] ?? tier}</strong> è attivo.
            Benvenuto.
          </p>
        ) : attempts >= 10 ? (
          <p className="text-gray-500 text-sm">
            Il piano si attiverà a breve — potrebbe richiedere qualche minuto.
            Ricarica la dashboard se non vedi il cambiamento.
          </p>
        ) : (
          <p className="text-gray-400 text-sm">
            Attivazione in corso…
          </p>
        )}

        <button
          onClick={() => navigate('/dashboard')}
          className="w-full rounded-lg bg-[#1A4D52] px-4 py-3 text-sm font-medium text-white hover:bg-[#143a3e] transition-colors"
        >
          Vai alla dashboard
        </button>

      </div>
    </div>
  )
}
