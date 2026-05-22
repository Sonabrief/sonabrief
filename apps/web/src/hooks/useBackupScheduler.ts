import { useEffect, useRef } from 'react'
import { isUnlocked } from '../lib/keystore'
import { syncAllMeetings } from '../lib/sync'

export type BackupFrequency = '1h' | '6h' | '24h' | 'off'

const FREQ_MS: Record<BackupFrequency, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  'off': 0,
}

export function useBackupScheduler(
  tier: string,
  frequency: BackupFrequency,
  onComplete?: (lastAt: number) => void,
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (tier !== 'unlimited' || frequency === 'off') return

    const ms = FREQ_MS[frequency]

    const run = async () => {
      if (!isUnlocked()) return
      try {
        const result = await syncAllMeetings()
        if (result.synced > 0 || result.failed === 0) {
          onComplete?.(result.lastSyncedAt)
        }
      } catch {
        // silenzioso — non disturbare l'utente
      }
    }

    timerRef.current = setInterval(run, ms)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [tier, frequency, onComplete])
}