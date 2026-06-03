import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'

const POLAR_LINKS: Record<string, string> = {
  pro: 'https://buy.polar.sh/polar_cl_eIhgJNYCanx2n00sHfwHoUxpCO3fBBnvluJlXPNqgeI',
  pro_unlimited: 'https://buy.polar.sh/polar_cl_TDX0b21k0ZCDIh6dRTjJ0dZgGsFiJtKtjyqnlxV1XTY',
}

export default function CheckoutPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const plan = params.get('plan') ?? ''
  const url = POLAR_LINKS[plan]

  useEffect(() => {
    if (!url) return
    const timer = setTimeout(() => {
      window.location.href = url
    }, 1800)
    return () => clearTimeout(timer)
  }, [url])

  if (!url) {
    window.location.href = '/dashboard'
    return null
  }

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

        <p className="mt-6 text-xs text-muted-foreground">
          {t('checkout.manual_link_hint')}{' '}
          <a
            href={url}
            className="underline hover:text-foreground transition-colors"
          >
            {t('checkout.manual_link_cta')}
          </a>
        </p>
      </motion.div>
    </div>
  )
}
