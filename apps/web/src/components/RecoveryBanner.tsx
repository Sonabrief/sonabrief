import { useEffect, useState } from 'react'
import { findOrphanChunks, deleteOrphanSession } from '../lib/chunkStore'
import { db } from '../lib/db'
import type { RecordingSession } from '../lib/db'

interface OrphanInfo {
  sessionId: string
  count: number
  oldestMs: number
}

export function RecoveryBanner() {
  const [orphans, setOrphans] = useState<OrphanInfo[]>([])
  const [savedSessions, setSavedSessions] = useState<RecordingSession[]>([])

  useEffect(() => {
    findOrphanChunks().then(setOrphans).catch(() => {})
    db.recording_sessions.toArray().then(setSavedSessions).catch(() => {})
  }, [])

  if (!orphans.length && !savedSessions.length) return null

  async function dismiss(sessionId: string) {
    await deleteOrphanSession(sessionId)
    setOrphans(prev => prev.filter(o => o.sessionId !== sessionId))
  }

  return (
    <div className="mb-4 space-y-2">
      {savedSessions.map(s => {
        const date = new Date(s.updatedAt).toLocaleString('it-IT', {
          day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        })
        const words = s.partialText.split(' ').length
        return (
          <div key={s.sessionId} className="flex items-start justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Trascrizione parziale recuperabile
              </p>
              <p className="text-xs text-muted-foreground">
                {date} · ~{words} parole trascritte
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(s.partialText)
                  db.recording_sessions.delete(s.sessionId)
                  setSavedSessions(prev => prev.filter(x => x.sessionId !== s.sessionId))
                }}
                className="text-xs font-medium text-primary underline hover:text-primary/80"
              >
                Copia testo
              </button>
              <button
                onClick={() => {
                  db.recording_sessions.delete(s.sessionId)
                  setSavedSessions(prev => prev.filter(x => x.sessionId !== s.sessionId))
                }}
                className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
              >
                Elimina
              </button>
            </div>
          </div>
        )
      })}
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
