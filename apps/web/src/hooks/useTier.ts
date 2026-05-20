import { useEffect, useState } from 'react'
import { getBillingStatus } from '../lib/api'

export type Tier = 'free' | 'pro' | 'unlimited'

export function useTier() {
  const [tier, setTier] = useState<Tier>('free')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBillingStatus().then(status => {
      if (status?.tier === 'pro') setTier('pro')
      else if (status?.tier === 'unlimited') setTier('unlimited')
      else setTier('free')
      setLoading(false)
    })
  }, [])

  return { tier, loading, isPro: tier !== 'free', isFree: tier === 'free' }
}