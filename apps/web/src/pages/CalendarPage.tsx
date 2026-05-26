import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Mic, RefreshCw } from 'lucide-react'
import { SiGooglecalendar } from 'react-icons/si'
import { BiLogoMicrosoft } from 'react-icons/bi'
import { API_URL } from '../config'
import { AppNav } from '../components/AppNav'
import i18n from '../i18n'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  attendees: { email: string; name?: string }[]
  meetingUrl?: string | null
}

interface CalendarState {
  connected: boolean
  events: CalendarEvent[]
  error?: string
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function groupByDay(events: (CalendarEvent & { provider: 'google' | 'microsoft' })[], t: TFunction) {
  const groups: { label: string; date: string; events: typeof events }[] = []
  for (const event of events) {
    const day = new Date(event.start).toDateString()
    const existing = groups.find(g => g.date === day)
    if (existing) {
      existing.events.push(event)
    } else {
      const d = new Date(event.start)
      const today = new Date()
      const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
      let label: string
      if (d.toDateString() === today.toDateString()) label = t('calendar.today')
      else if (d.toDateString() === tomorrow.toDateString()) label = t('calendar.tomorrow')
      else label = d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
      groups.push({ label, date: day, events: [event] })
    }
  }
  return groups
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  name, label, connected, connecting, onConnect, onDisconnect, t,
}: {
  name: 'google' | 'microsoft'; label: string; connected: boolean
  connecting: boolean; onConnect: () => void; onDisconnect: () => void; t: TFunction
}) {
  const icon = name === 'google'
    ? <SiGooglecalendar size={20} color="#1A73E8" />
    : <BiLogoMicrosoft size={20} color="#0078D4" />
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          connected ? 'bg-primary/10 text-primary' : 'bg-border text-muted-foreground'
        }`}>
          {connected ? t('calendar.connected') : t('calendar.not_connected')}
        </span>
      </div>
      {connected ? (
        <button onClick={onDisconnect} className="text-xs text-destructive transition-colors hover:underline motion-reduce:transition-none">
          {t('calendar.disconnect')}
        </button>
      ) : (
        <button
          onClick={onConnect} disabled={connecting}
          className="w-full rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 motion-reduce:transition-none"
        >
          {connecting ? t('calendar.connecting') : t('calendar.connect', { label })}
        </button>
      )}
    </div>
  )
}

function CompactProviderCard({
  name, label, connected, onConnect, onDisconnect, t,
}: {
  name: 'google' | 'microsoft'; label: string; connected: boolean
  onConnect: () => void; onDisconnect: () => void; t: TFunction
}) {
  const icon = name === 'google'
    ? <SiGooglecalendar size={14} color="#1A73E8" />
    : <BiLogoMicrosoft size={14} color="#0078D4" />
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
      {icon}
      <span className="text-xs text-muted-foreground">{label}</span>
      {connected ? (
        <button onClick={onDisconnect} className="ml-1 text-xs text-destructive hover:underline">{t('calendar.disconnect')}</button>
      ) : (
        <button onClick={onConnect} className="ml-1 text-xs text-primary hover:underline">{t('calendar.connect', { label })}</button>
      )}
    </div>
  )
}

// ── Attendees list ────────────────────────────────────────────────────────────

function AttendeesList({ attendees }: { attendees: { email: string; name?: string }[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? attendees : attendees.slice(0, 3)
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      {visible.map(a => a.name ?? a.email).join(', ')}
      {!showAll && attendees.length > 3 && (
        <button
          onClick={e => { e.stopPropagation(); setShowAll(true) }}
          className="ml-1 font-medium text-primary hover:underline"
        >
          +{attendees.length - 3}
        </button>
      )}
    </p>
  )
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({
  event, provider, index, t,
}: {
  event: CalendarEvent; provider: 'google' | 'microsoft'; index: number; t: TFunction
}) {
  const navigate = useNavigate()

  function handleStart() {
    navigate('/recording', {
      state: {
        prefillTitle: event.title,
        source: 'both',
        participants: event.attendees.map(a => a.name ?? a.email),
        meetingUrl: event.meetingUrl ?? null,
      },
    })
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {provider === 'google'
              ? <SiGooglecalendar size={12} color="#1A73E8" />
              : <BiLogoMicrosoft size={12} color="#0078D4" />}
            <p className="text-sm font-medium text-foreground">{event.title}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatEventDate(event.start)} · {formatDuration(event.start, event.end)}
          </p>
          {event.attendees.length > 0 && (
            <AttendeesList attendees={event.attendees} />
          )}
          <button
            onClick={handleStart}
            className="mt-3 flex items-center gap-1.5 rounded-md border border-primary px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            {t('calendar.start_meeting')}
          </button>
        </div>
      </div>
    </motion.li>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t } = useTranslation()
  const [google, setGoogle] = useState<CalendarState | null>(null)
  const [microsoft, setMicrosoft] = useState<CalendarState | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<'google' | 'microsoft' | null>(null)

  async function loadCalendars() {
    setLoading(true)
    const [gRes, mRes] = await Promise.all([
      fetch(`${API_URL}/v1/calendar/events`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/v1/calendar/microsoft/events`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ])
    setGoogle(gRes)
    setMicrosoft(mRes)
    setLoading(false)
  }

  useEffect(() => { loadCalendars() }, [])

  async function connectGoogle() {
    setConnecting('google')
    const res = await fetch(`${API_URL}/auth/google/start`, { credentials: 'include' })
    const data = await res.json() as { url: string }
    window.location.href = data.url
  }

  async function connectMicrosoft() {
    setConnecting('microsoft')
    const res = await fetch(`${API_URL}/auth/microsoft/start`, { credentials: 'include' })
    const data = await res.json() as { url: string }
    window.location.href = data.url
  }

  async function disconnectGoogle() {
    await fetch(`${API_URL}/v1/calendar/disconnect`, { method: 'POST', credentials: 'include' })
    setGoogle(null)
    loadCalendars()
  }

  async function disconnectMicrosoft() {
    await fetch(`${API_URL}/v1/calendar/microsoft/disconnect`, { method: 'POST', credentials: 'include' })
    setMicrosoft(null)
    loadCalendars()
  }

  const allEvents = [
    ...(google?.events ?? []).map(e => ({ ...e, provider: 'google' as const })),
    ...(microsoft?.events ?? []).map(e => ({ ...e, provider: 'microsoft' as const })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const isConnected = !!(google?.connected || microsoft?.connected)

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="font-heading text-2xl font-bold leading-[1.2] tracking-[-0.015em] text-foreground"
          >
            {t('calendar.title')}
          </motion.h1>
          <button
            onClick={loadCalendars}
            disabled={loading}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:opacity-40 motion-reduce:transition-none"
            aria-label={t('calendar.refresh_aria')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {isConnected ? (
            <div className="flex justify-end gap-2">
              <CompactProviderCard name="google" label="Google Calendar" connected={!!google?.connected} onConnect={connectGoogle} onDisconnect={disconnectGoogle} t={t} />
              <CompactProviderCard name="microsoft" label="Microsoft 365" connected={!!microsoft?.connected} onConnect={connectMicrosoft} onDisconnect={disconnectMicrosoft} t={t} />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <ProviderCard name="google" label="Google Calendar" connected={!!google?.connected} connecting={connecting === 'google'} onConnect={connectGoogle} onDisconnect={disconnectGoogle} t={t} />
              <ProviderCard name="microsoft" label="Microsoft 365" connected={!!microsoft?.connected} connecting={connecting === 'microsoft'} onConnect={connectMicrosoft} onDisconnect={disconnectMicrosoft} t={t} />
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="animate-pulse space-y-3">
                {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-lg bg-border" />)}
              </motion.div>
            ) : !isConnected ? (
              <motion.div key="empty-unconnected" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="rounded-lg border border-border bg-card p-8 text-center">
                <p className="text-sm font-semibold text-foreground">{t('calendar.no_calendar_title')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('calendar.no_calendar_hint')}</p>
              </motion.div>
            ) : allEvents.length === 0 ? (
              <motion.div key="empty-connected" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="rounded-lg border border-border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">{t('calendar.no_meetings')}</p>
              </motion.div>
            ) : (
              <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col gap-5">
                {groupByDay(allEvents, t).map(group => (
                  <div key={group.date} className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-muted-foreground capitalize">{group.label}</p>
                    <ul className="flex flex-col gap-2" role="list">
                      {group.events.map((event, i) => (
                        <EventCard key={`${event.provider}-${event.id}`} event={event} provider={event.provider} index={i} t={t} />
                      ))}
                    </ul>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
