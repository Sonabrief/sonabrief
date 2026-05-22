import { useEffect } from 'react'
import { db } from '../lib/db'
import type { Tier } from './useTier'

const FREE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 giorni

export function useRetentionCleanup(tier: Tier, loading: boolean) {
  useEffect(() => {
    if (loading || tier !== 'free') return

    const run = async () => {
      const cutoff = Date.now() - FREE_RETENTION_MS
      const oldMeetings = await db.meetings
        .where('startedAt')
        .below(cutoff)
        .toArray()

      if (oldMeetings.length === 0) return

      const ids = oldMeetings.map(m => m.id)

      await db.transaction('rw',
        [db.meetings, db.transcripts, db.notes, db.action_items, db.embeddings],
        async () => {
          await db.meetings.bulkDelete(ids)
          await db.transcripts.where('meetingId').anyOf(ids).delete()
          await db.notes.where('meetingId').anyOf(ids).delete()
          await db.action_items.where('meetingId').anyOf(ids).delete()
          await db.embeddings.where('meetingId').anyOf(ids).delete()
        }
      )

      console.info(`[retention] eliminati ${ids.length} meeting Free scaduti`)
    }

    run()
  }, [tier, loading])
}