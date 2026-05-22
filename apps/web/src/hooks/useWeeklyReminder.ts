import { useEffect } from 'react'
import { db } from '../lib/db'
import { API_URL } from '../config'

const STORAGE_KEY = 'sb_last_weekly_reminder'

function isMonday8am(): boolean {
  const now = new Date()
  return now.getDay() === 1 && now.getHours() === 8
}

function alreadySentThisWeek(): boolean {
  const last = localStorage.getItem(STORAGE_KEY)
  if (!last) return false
  const lastDate = new Date(Number(last))
  const now = new Date()
  // stessa settimana ISO
  const weekOf = (d: Date) => {
    const jan1 = new Date(d.getFullYear(), 0, 1)
    return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  }
  return weekOf(lastDate) === weekOf(now) && lastDate.getFullYear() === now.getFullYear()
}

export function useWeeklyReminder(
  tier: string | null,
  weeklyReminderEnabled: boolean
) {
  useEffect(() => {
    if (!weeklyReminderEnabled) return
    if (tier === 'free' || tier === null) return

    const check = async () => {
      if (!isMonday8am()) return
      if (alreadySentThisWeek()) return

      // Legge action items aperti da IndexedDB
      const items = await db.action_items
        .filter(a => !a.completed)
        .toArray()

      if (items.length === 0) return

      // Arricchisce con titolo meeting
      const enriched = await Promise.all(items.map(async item => {
        const meeting = item.meetingId
          ? await db.meetings.get(item.meetingId)
          : null
        return {
          content: item.text,
          clientName: meeting?.clientName ?? undefined,
          meetingTitle: meeting?.title ?? undefined,
          dueDate: item.dueDate ?? undefined,
        }
      }))

      const res = await fetch(`${API_URL}/v1/email/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ actionItems: enriched }),
      })

      if (res.ok) {
        localStorage.setItem(STORAGE_KEY, String(Date.now()))
      }
    }

    // Controlla al mount e poi ogni 30 minuti
    check()
    const interval = setInterval(check, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [tier, weeklyReminderEnabled])
}
