import { useEffect, useState } from 'react'
import { findOrphanChunks, deleteOrphanSession } from '../lib/chunkStore'

interface OrphanInfo {
  sessionId: string
  count: number
  oldestMs: number
}

export function RecoveryBanner() {
  const [orphans, setOrphans] = useState<OrphanInfo[]>([])

  useEffect(() => {
    findOrphanChunks().then(setOrphans).catch(() => {})
  }, [])

  if (!orphans.length) return null

  async function dismiss(sessionId: string) {
    await deleteOrphanSession(sessionId)
    setOrphans(prev => prev.filter(o => o.sessionId !== sessionId))
  }

  return (
    <div className="mb-4 space-y-2">
      {orphans.map(o => {
        const date = new Date(o.oldestMs).toLocaleString('it-IT', {
          day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        })
        const minutes = Math.round((o.count * 30) / 60)
        return (
          <div
            key={o.sessionId}
            className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950"
          >
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Registrazione interrotta trovata
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {date} · circa {minutes} min registrati · l'audio temporaneo non è recuperabile dopo un crash, ma puoi eliminarlo.
              </p>
            </div>
            <button
              onClick={() => dismiss(o.sessionId)}
              className="shrink-0 text-xs font-medium text-amber-700 underline hover:text-amber-900 dark:text-amber-300"
            >
              Elimina
            </button>
          </div>
        )
      })}
    </div>
  )
}
