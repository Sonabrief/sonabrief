import { useState, useEffect } from 'react'
import { db } from '../lib/db'

export interface BriefingData {
  recentMeetings: { id: string; title: string; date: number; summary: string }[]
  openActionItems: { id: string; text: string; meetingTitle: string; meetingDate: number }[]
}

export function useMeetingBriefing() {
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const since = Date.now() - 90 * 24 * 60 * 60 * 1000
        const meetings = await db.meetings
          .where('startedAt').above(since)
          .reverse()
          .sortBy('startedAt')

        const recentMeetings = await Promise.all(
          meetings.slice(0, 10).map(async (m) => {
            const note = await db.notes.where('meetingId').equals(m.id).first()
            // Estrai prime 2 righe non vuote della sintesi come preview
            const lines = (note?.content ?? '')
              .split('\n')
              .map(l => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim())
              .filter(l => l.length > 10)
            const summary = lines.slice(0, 2).join(' · ') || 'Nessuna sintesi disponibile'
            return { id: m.id, title: m.title, date: m.startedAt, summary }
          })
        )

        const openItems = await db.action_items
          .where('completed').equals(0 as unknown as import('dexie').IndexableType)
          .reverse()
          .sortBy('createdAt')

        setBriefing({
          recentMeetings,
          openActionItems: openItems.slice(0, 15).map(a => ({
            id: a.id,
            text: a.text,
            meetingTitle: a.meetingTitle,
            meetingDate: a.meetingDate,
          })),
        })
      } catch (e) {
        console.error('[briefing]', e)
        setBriefing({ recentMeetings: [], openActionItems: [] })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { briefing, loading }
}
