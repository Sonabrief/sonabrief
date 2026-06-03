import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { API_URL } from '../config'

// Mappa il plan dell'onboarding al tier atteso dall'endpoint autenticato.
// Solo mensile dall'onboarding: l'annuale si sceglie dalla pagina /pricing.
const PLAN_TO_TIER: Record<string, string> = {
  pro: 'pro_monthly',
  pro_unlimited: 'unlimited_monthly',
}

export default function CheckoutPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const plan = params.get('plan') ?? ''
  const tier = PLAN_TO_TIER[plan]

  const [status, setStatus] = useState<'loading' | 'error'>('loading')

  const startCheckout = useCallback(async () => {
    if (!tier) return
    setStatus('loading')
    try {
      const res = await fetch(`${API_URL}/v1/checkout/polar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      if (!res.ok) throw new Error('checkout_failed')
      const data = await res.json() as { url: string }
      if (!data?.url) throw new Error('missing_url')
      // Dominio esterno (Polar): redirect full-page corretto.
      window.location.href = data.url
    } catch {
      setStatus('error')
    }
  }, [tier])

  useEffect(() => {
    // ?plan assente o invalido → torna alla dashboard (navigazione SPA).
    if (!tier) {
      navigate('/dashboard', { replace: true })
      return
    }
    startCheckout()
  }, [tier, startCheckout, navigate])

  if (!tier) return null

  const planName =
    plan === 'pro_unlimited'
      ? t('checkout.plan_pro_unlimited')
      : t('checkout.plan_pro')

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md text-center"
      >
        <img src="/logo.svg" alt="Sonabrief" className="mx-auto mb-10 h-8 w-auto" />

        {status === 'loading' ? (
          <>
            <h1 className="font-heading font-extrabold text-[clamp(1.5rem,3.5vw,2rem)] leading-[1.15] tracking-[-0.02em] text-foreground">
              {t('checkout.title', { plan: planName })}
            </h1>

            <p className="mt-3 text-sm text-muted-foreground">
              {t('checkout.subtitle')}
            </p>

            <div className="mt-8 flex justify-center">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-primary"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-heading font-extrabold text-[clamp(1.5rem,3.5vw,2rem)] leading-[1.15] tracking-[-0.02em] text-foreground">
              {t('checkout.error_title')}
            </h1>

            <p className="mt-3 text-sm text-muted-foreground">
              {t('checkout.error_subtitle')}
            </p>

            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={startCheckout}
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                {t('checkout.retry')}
              </button>
              <a
                href="/pricing"
                className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
              >
                {t('checkout.go_pricing')}
              </a>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
