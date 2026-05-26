import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { findOrphanChunks, deleteOrphanSession } from '../lib/chunkStore'
import { db } from '../lib/db'
import type { RecordingSession } from '../lib/db'
import { formatMeetingTitle } from '../lib/locale'
import i18n from '../i18n'

interface OrphanInfo {
  sessionId: string
  count: number
  oldestMs: number
}

export function RecoveryBanner() {
  const { t } = useTranslation()
  const [orphans, setOrphans] = useState<OrphanInfo[]>([])
  const [savedSessions, setSavedSessions] = useState<RecordingSession[]>([])

  useEffect(() => {
    findOrphanChunks().then(setOrphans).catch((e) => console.warn('[recovery]', e))
    db.recording_sessions
      .filter(s => !s.status || s.status === 'interrupted')
      .toArray()
      .then(setSavedSessions)
      .catch((e) => console.warn('[recovery]', e))
  }, [])

  if (!orphans.length && !savedSessions.length) return null

  async function dismiss(sessionId: string) {
    await deleteOrphanSession(sessionId)
    setOrphans(prev => prev.filter(o => o.sessionId !== sessionId))
  }

  return (
    <div className="mb-4 space-y-2">
      {savedSessions.map(s => {
        const date = new Date(s.updatedAt).toLocaleString(i18n.language, {
          day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        })
        const words = s.partialText.split(' ').length
        return (
          <div key={s.sessionId} className="flex items-start justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('recovery_banner.transcript_title')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('recovery_banner.transcript_info', { date, words })}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={async () => {
                  const now = Date.now()
                  const id = crypto.randomUUID()
                  await db.transaction('rw', [db.meetings, db.transcripts], async () => {
                    await db.meetings.add({
                      id,
                      title: formatMeetingTitle(new Date(s.updatedAt)),
                      startedAt: s.startedAt,
                      endedAt: s.updatedAt,
                      durationSeconds: Math.round((s.updatedAt - s.startedAt) / 1000),
                      mode: 'standard',
                      lang: s.lang,
                      hasSynthesis: false,
                      createdAt: now,
                      updatedAt: now,
                    })
                    await db.transcripts.add({
                      id: crypto.randomUUID(),
                      meetingId: id,
                      text: s.partialText,
                      createdAt: now,
                    })
                  })
                  await db.recording_sessions.delete(s.sessionId)
                  setSavedSessions(prev => prev.filter(x => x.sessionId !== s.sessionId))
                }}
                className="text-xs font-medium text-primary underline hover:text-primary/80"
              >
                {t('recovery_banner.save_archive')}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(s.partialText)
                  db.recording_sessions.delete(s.sessionId)
                  setSavedSessions(prev => prev.filter(x => x.sessionId !== s.sessionId))
                }}
                className="text-xs font-medium text-primary underline hover:text-primary/80"
              >
                {t('recovery_banner.copy_text')}
              </button>
              <button
                onClick={() => {
                  db.recording_sessions.delete(s.sessionId)
                  setSavedSessions(prev => prev.filter(x => x.sessionId !== s.sessionId))
                }}
                className="text-xs font-medium text-muted-foreground underline hover:text-foreground"
              >
                {t('recovery_banner.delete')}
              </button>
            </div>
          </div>
        )
      })}
      {orphans.map(o => {
        const date = new Date(o.oldestMs).toLocaleString(i18n.language, {
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
                {t('recovery_banner.recording_title')}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t('recovery_banner.recording_info', { date, minutes })}
              </p>
            </div>
            <button
              onClick={() => dismiss(o.sessionId)}
              className="shrink-0 text-xs font-medium text-amber-700 underline hover:text-amber-900 dark:text-amber-300"
            >
              {t('recovery_banner.delete')}
            </button>
          </div>
        )
      })}
    </div>
  )
}
