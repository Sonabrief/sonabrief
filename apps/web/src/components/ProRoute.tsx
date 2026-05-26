import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getBillingStatus } from '../lib/api'

interface ProRouteProps {
  children: React.ReactNode
  feature?: string
}

export default function ProRoute({ children, feature }: ProRouteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getBillingStatus().then(status => {
      const tier = status?.tier ?? 'free'
      if (tier === 'free') {
        navigate('/pricing', { state: { upgradePrompt: feature ?? t('pro_route.this_feature') } })
      }
      setChecking(false)
    })
  }, [])

  if (checking) return null
  return <>{children}</>
}