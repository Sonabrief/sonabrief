import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Mic } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { API_URL } from '../config'
import {
  getMe, getBillingStatus, getBillingPortalUrl,
  getPreferences, type BillingStatus,
} from '../lib/api'
import { AppNav } from '../components/AppNav'
import { NumberTicker } from '../components/ui/number-ticker'
import { BorderBeam } from '../components/ui/border-beam'
import { ShimmerButton } from '../components/ui/shimmer-button'
import { useRetentionCleanup } from '../hooks/useRetentionCleanup'
import type { Tier } from '../hooks/useTier'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  attendees: { email: string; name?: string }[]
}

interface CalendarState {
  connected: boolean
  events: CalendarEvent[]
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

function formatEventTime(start: string): string {
  return new Date(start).toLocaleString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  unlimited: 'Pro Unlimited',
}

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  if (tier === 'unlimited') {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ background: '#F5EFE4', color: '#7A5C30' }}
      >
        {TIER_LABEL.unlimited}
      </span>
    )
  }
  if (tier === 'pro') {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-primary">
        {TIER_LABEL.pro}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {TIER_LABEL.free}
    </span>
  )
}

// ── Quota bar ─────────────────────────────────────────────────────────────────

function QuotaBar({ used, cap, percent }: { used: number; cap: number; percent: number }) {
  const remaining = Math.max(0, cap - used)
  const warning = percent > 80
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Quota sintesi cloud: ${percent}% utilizzata, ${formatMinutes(remaining)} rimanenti su ${formatMinutes(cap)}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${
            warning ? 'bg-destructive' : 'bg-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatMinutes(used)} usati &middot; {formatMinutes(remaining)} rimanenti
      </p>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingShell() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 border-b border-border bg-card" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="animate-pulse lg:grid lg:grid-cols-[2fr_1fr] lg:gap-10">
          <div className="space-y-10">
            <div className="space-y-3">
              <div className="h-11 w-48 rounded-md bg-border" />
              <div className="h-4 w-72 rounded bg-border" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-32 rounded bg-border" />
              {[0, 1, 2].map(i => (
                <div key={i} className="h-19 rounded-lg bg-border" />
              ))}
            </div>
          </div>
          <div className="mt-10 space-y-4 lg:mt-0">
            <div className="h-32 rounded-lg bg-border" />
            <div className="h-28 rounded-lg bg-border" />
            <div className="h-16 rounded-lg bg-border" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [email, setEmail] = useState('')
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [ready, setReady] = useState(false)
  // undefined = loading, null = fetch error / not connected
  const [calGoogle, setCalGoogle] = useState<CalendarState | null | undefined>(undefined)
  const [calMicrosoft, setCalMicrosoft] = useState<CalendarState | null | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    getMe().then(user => { if (user) setEmail(user.email) })
    getBillingStatus().then(b => { if (b) setBilling(b) })
    getPreferences().then(prefs => {
      if (prefs && prefs.onboarded === 0) navigate('/onboarding')
      else setReady(true)
    })
    // Calendar loaded in parallel — does not block page readiness
    Promise.all([
      fetch(`${API_URL}/v1/calendar/events`, { credentials: 'include' })
        .then(r => r.json() as Promise<CalendarState>).catch(() => null),
      fetch(`${API_URL}/v1/calendar/microsoft/events`, { credentials: 'include' })
        .then(r => r.json() as Promise<CalendarState>).catch(() => null),
    ]).then(([g, m]) => {
      setCalGoogle(g)
      setCalMicrosoft(m)
    })
  }, [])

  const recentMeetings = useLiveQuery(
    () => db.meetings.orderBy('startedAt').reverse().limit(4).toArray(),
    []
  )

  const openItems = useLiveQuery(
    () => db.action_items.filter(item => !item.completed).toArray(),
    []
  )

  // Known client names to detect "Briefing" signal on calendar events
  const knownClients = useLiveQuery(async () => {
    const meetings = await db.meetings.filter(m => !!m.clientName).toArray()
    return new Set(meetings.map(m => m.clientName!.toLowerCase()))
  }, [])

  async function handleManageSubscription() {
    const url = await getBillingPortalUrl()
    if (url) window.open(url, '_blank')
  }

  function hasBriefingData(event: CalendarEvent): boolean {
    if (!knownClients?.size) return false
    const titleLower = event.title.toLowerCase()
    const attendeeTexts = event.attendees.map(a => (a.name ?? a.email).toLowerCase())
    return [...knownClients].some(client =>
      titleLower.includes(client) ||
      attendeeTexts.some(t => t.includes(client) || client.includes(t))
    )
  }

  const tier = billing?.tier ?? 'free'
  useRetentionCleanup(tier as Tier, !ready)

  if (!ready) return <LoadingShell />
  const used = billing?.quota_used_minutes ?? 0
  const cap = billing?.quota_cap_minutes ?? 300
  const percentUsed = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0

  const openCount = openItems?.length ?? 0
  const topItems = openItems?.slice(0, 3) ?? []

  const isCalLoading = calGoogle === undefined && calMicrosoft === undefined
  const isCalConnected = !!(calGoogle?.connected || calMicrosoft?.connected)
  const now = new Date()
  const upcomingEvents = [
    ...(calGoogle?.events ?? []),
    ...(calMicrosoft?.events ?? []),
  ]
    .filter(e => new Date(e.start) > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">Dashboard &mdash; Sonabrief</h1>
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-10">

          {/* ── Left column ───────────────────────────────── */}
          <div className="space-y-10">

            {/* Hero */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              aria-labelledby="nuova-sessione-heading"
            >
              <div
                className="rounded-2xl border border-border px-7 py-8"
                style={{ background: 'color-mix(in srgb, var(--accent) 6%, var(--card))' }}
              >
                <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Nuova sessione
                </p>
                <Mic className="mb-5 h-8 w-8 text-primary" strokeWidth={1.5} />
                <h2
                  id="nuova-sessione-heading"
                  className="font-heading mb-1.5 text-xl font-semibold tracking-[-0.015em] text-foreground"
                >
                  Registra, trascrivi, archivia
                </h2>
                <p className="mb-8 text-sm text-muted-foreground">
                  Tutto elaborato sul tuo computer. Mai nel cloud.
                </p>
                <ShimmerButton
                  onClick={() => navigate('/recording')}
                  className="h-10 px-6 text-sm font-semibold"
                >
                  Avvia registrazione
                </ShimmerButton>
              </div>
            </motion.section>

            {/* Upcoming calendar events */}
            <section aria-labelledby="calendario-heading">
              <div className="mb-4 flex items-center justify-between">
                <h2
                  id="calendario-heading"
                  className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Prossimi meeting
                </h2>
                <button
                  onClick={() => navigate('/calendar')}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                >
                  Calendario
                </button>
              </div>

              {isCalLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-19 animate-pulse rounded-lg bg-border" />
                  ))}
                </div>
              ) : !isCalConnected ? (
                <p className="text-sm text-muted-foreground">
                  Nessun calendario collegato.{' '}
                  <button
                    onClick={() => navigate('/calendar')}
                    className="font-medium text-primary transition-colors hover:underline motion-reduce:transition-none"
                  >
                    Collega calendario
                  </button>
                </p>
              ) : upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun meeting in programma.
                </p>
              ) : (
                <ul className="space-y-2" role="list">
                  {upcomingEvents.map(event => (
                    <li key={event.id}>
                      <div className="rounded-lg border border-border bg-card px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">
                                {event.title}
                              </p>
                              {hasBriefingData(event) && (
                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  Briefing
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatEventTime(event.start)}
                            </p>
                            {event.attendees.length > 0 && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {event.attendees.slice(0, 3).map(a => a.name ?? a.email).join(', ')}
                                {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── Right column ──────────────────────────────── */}
          <aside className="mt-10 space-y-4 lg:mt-0" aria-label="Riepilogo">

            {/* Recent meetings — compact, no preview */}
            <section
              className="rounded-lg border border-border bg-card px-4 py-4"
              aria-labelledby="recenti-heading"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="recenti-heading"
                  className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Recenti
                </h2>
                <button
                  onClick={() => navigate('/archive')}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                >
                  Vedi tutti
                </button>
              </div>

              {recentMeetings === undefined ? (
                <div className="animate-pulse space-y-2.5">
                  {[0, 1, 2].map(i => <div key={i} className="h-8 rounded bg-border" />)}
                </div>
              ) : recentMeetings.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun meeting.</p>
              ) : (
                <ul className="divide-y divide-border" role="list">
                  {recentMeetings.map((meeting, i) => (
                    <motion.li
                      key={meeting.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, delay: i * 0.05, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <button
                        onClick={() => navigate('/archive')}
                        className="flex w-full items-start justify-between gap-2 py-2.5 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">
                            {meeting.title}
                          </p>
                          {meeting.clientName && (
                            <p className="truncate text-xs text-primary">
                              {meeting.clientName}
                            </p>
                          )}
                        </div>
                        <time
                          className="shrink-0 text-xs tabular-nums text-muted-foreground"
                          dateTime={new Date(meeting.startedAt).toISOString()}
                        >
                          {formatDateShort(meeting.startedAt)}
                        </time>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
            </section>

            {/* Action items — compact */}
            <section
              className="rounded-lg border border-border bg-card px-4 py-4"
              aria-labelledby="azioni-heading"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2
                  id="azioni-heading"
                  className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Azioni
                </h2>
                <button
                  onClick={() => navigate('/actions')}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                >
                  Vedi tutte
                </button>
              </div>

              {openItems === undefined ? (
                <div className="animate-pulse space-y-2">
                  {[0, 1].map(i => <div key={i} className="h-6 rounded bg-border" />)}
                </div>
              ) : openCount === 0 ? (
                <p className="text-xs text-muted-foreground">Nessuna azione in sospeso.</p>
              ) : (
                <>
                  <p className="mb-2.5">
                    <NumberTicker
                      value={openCount}
                      className="text-xl font-semibold text-foreground"
                    />
                    <span className="ml-1 text-xs text-muted-foreground">in sospeso</span>
                  </p>
                  <ul className="space-y-2" role="list">
                    {topItems.map(item => (
                      <li key={item.id} className="flex gap-2">
                        <span
                          className="mt-1.25 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                        <p className="line-clamp-2 text-xs leading-snug text-foreground">
                          {item.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {/* Quota — minimal */}
            {billing && tier !== 'unlimited' && (
              <section
                className="relative rounded-lg border border-border bg-card px-4 py-3"
                aria-labelledby="quota-heading"
              >
                {percentUsed > 80 && (
                  <BorderBeam
                    size={60}
                    duration={8}
                    colorFrom="#B84545"
                    colorTo="#C89868"
                    borderWidth={1.5}
                  />
                )}
                <div className="mb-2 flex items-center justify-between">
                  <h2
                    id="quota-heading"
                    className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    Sintesi cloud
                  </h2>
                  <TierBadge tier={tier} />
                </div>
                <QuotaBar used={used} cap={cap} percent={percentUsed} />
                {tier === 'free' && (
                  <button
                    onClick={() => navigate('/pricing')}
                    className="mt-2 text-xs font-medium text-primary transition-colors hover:underline motion-reduce:transition-none"
                  >
                    Passa a Pro
                  </button>
                )}
              </section>
            )}

            {/* Account */}
            <section
              className="rounded-lg border border-border bg-card px-4 py-4"
              aria-labelledby="account-heading"
            >
              <h2
                id="account-heading"
                className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Account
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">{email}</p>
                  {tier === 'unlimited' && <TierBadge tier={tier} />}
                </div>
                {billing?.billing_cycle && tier !== 'free' && (
                  <p className="text-xs text-muted-foreground">
                    {billing.billing_cycle === 'monthly' ? 'Piano mensile' : 'Piano annuale'}
                  </p>
                )}
                {tier !== 'free' && (
                  <button
                    onClick={handleManageSubscription}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                  >
                    Gestisci abbonamento
                  </button>
                )}
              </div>
            </section>

          </aside>
        </div>
      </main>
    </div>
  )
}
