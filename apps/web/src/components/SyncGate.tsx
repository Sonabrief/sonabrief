import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { restoreKeyFromSession } from '../lib/keystore'

type Status = 'checking' | 'ready'

export default function SyncGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    const syncEnabled = localStorage.getItem('sonabrief_sync_enabled') === 'true'
    if (!syncEnabled) {
      setStatus('ready')
      return
    }
    restoreKeyFromSession().then(restored => {
      if (restored) {
        setStatus('ready')
      } else {
        navigate('/sync/unlock', { replace: true })
      }
    })
  }, [navigate])

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1A4D52] border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
