import { useEffect, useState } from 'react'
import { SiGooglecalendar } from 'react-icons/si'
import { BiLogoMicrosoft } from 'react-icons/bi'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Mic, Lock } from 'lucide-react'
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
import { useWeeklyReminder } from '../hooks/useWeeklyReminder'
import type { Tier } from '../hooks/useTier'
import i18n from '../i18n'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  attendees: { email: string; name?: string }[]
  meetingUrl?: string | null
  provider?: 'google' | 'microsoft'
}

interface CalendarState {
  connected: boolean
  events: CalendarEvent[]
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatEventTime(start: string): string {
  return new Date(start).toLocaleString(i18n.language, {
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
      <span className="inline-flex items-center rounded-full border border-amber-200 dark:border-amber-800 bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
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
  const { t } = useTranslation()
  const remaining = Math.max(0, cap - used)
  const warning = percent > 80
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('dashboard.quota_aria', { percent, remaining: formatMinutes(remaining), cap: formatMinutes(cap) })}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full opacity-100 transition-[width] duration-300 ease-out motion-reduce:transition-none ${
            warning ? 'bg-destructive' : 'bg-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('dashboard.quota_used_remaining', { used: formatMinutes(used), remaining: formatMinutes(remaining) })}
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

// ── Dashboard event card ──────────────────────────────────────────────────────

function DashboardEventCard({ event, hasBriefing, provider }: { event: CalendarEvent; hasBriefing: boolean; provider?: 'google' | 'microsoft' }) {
  const { t } = useTranslation()
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
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
            {hasBriefing && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {t('dashboard.briefing_badge')}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{formatEventTime(event.start)}</p>
          {event.attendees.length > 0 && (
            <AttendeesList attendees={event.attendees} />
          )}
          <button
            onClick={handleStart}
            className="mt-3 flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            {t('dashboard.start_record')}
          </button>
        </div>
        {provider === 'google' && <SiGooglecalendar size={14} color="#1A73E8" className="mt-0.5 shrink-0" />}
        {provider === 'microsoft' && <BiLogoMicrosoft size={14} color="#0078D4" className="mt-0.5 shrink-0" />}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [ready, setReady] = useState(false)
  // undefined = loading, null = fetch error / not connected
  const [calGoogle, setCalGoogle] = useState<CalendarState | null | undefined>(undefined)
  const [calMicrosoft, setCalMicrosoft] = useState<CalendarState | null | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    getMe().then(user => {
      if (user) {
        setEmail(user.email)
        if (user.display_name) setDisplayName(user.display_name)
      }
    })
    getBillingStatus().then(b => { if (b) setBilling(b) })
    getPreferences().then(prefs => {
      if (prefs && prefs.onboarded === 0) navigate('/onboarding')
      else setReady(true)
      if (prefs?.weekly_reminder_enabled !== undefined) {
        localStorage.setItem('sb_weekly_reminder', prefs.weekly_reminder_enabled === 1 ? '1' : '0')
      }
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
    if (url) {
      window.open(url, '_blank')
    } else {
      toast.error(t('dashboard.error'), { description: t('dashboard.portal_error') })
    }
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
  const weeklyReminderEnabled = localStorage.getItem('sb_weekly_reminder') === '1'
  useWeeklyReminder(tier, weeklyReminderEnabled)

  if (!ready) return <LoadingShell />
  const used = billing?.quota_used_minutes ?? 0
  const cap = billing?.quota_cap_minutes ?? 180
  const percentUsed = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0

  const openCount = openItems?.length ?? 0
  const topItems = openItems?.slice(0, 3) ?? []

  const quotaSection = billing && tier !== 'unlimited' ? (
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
          {t('dashboard.cloud_synthesis')}
        </h2>
        <TierBadge tier={tier} />
      </div>
      <QuotaBar used={used} cap={cap} percent={percentUsed} />
      {tier === 'free' && (
        <button
          onClick={() => navigate('/pricing')}
          className="mt-2 text-xs font-medium text-primary transition-colors hover:underline motion-reduce:transition-none"
        >
          {t('dashboard.upgrade_pro')}
        </button>
      )}
    </section>
  ) : null

  const isCalLoading = calGoogle === undefined && calMicrosoft === undefined
  const isCalConnected = !!(calGoogle?.connected || calMicrosoft?.connected)
  const now = new Date()
  const upcomingEvents = [
    ...(calGoogle?.events ?? []).map(e => ({ ...e, provider: 'google' as const })),
    ...(calMicrosoft?.events ?? []).map(e => ({ ...e, provider: 'microsoft' as const })),
  ]
    .filter(e => new Date(e.end) > now)
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
                <Mic className="mb-5 h-8 w-8 text-primary" strokeWidth={1.5} />
                <h2
                  id="nuova-sessione-heading"
                  className="font-heading mb-1.5 text-xl font-semibold tracking-[-0.015em] text-foreground"
                >
                  {displayName ? t('dashboard.greeting', { name: displayName }) : t('dashboard.tagline')}
                </h2>
                {displayName && (
                  <p className="font-heading mb-1 text-sm text-muted-foreground">
                    {t('dashboard.tagline')}
                  </p>
                )}
                <p className="mb-8 text-sm text-muted-foreground">
                  {t('dashboard.privacy_note')}
                </p>
                <ShimmerButton
                  onClick={() => navigate('/recording')}
                  className="h-10 px-6 text-sm font-semibold"
                >
                  {t('dashboard.start_recording')}
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
                  {t('dashboard.upcoming_meetings')}
                </h2>
                <button
                  onClick={() => navigate('/calendar')}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                >
                  {t('dashboard.calendar_section')}
                </button>
              </div>

              {isCalLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-19 animate-pulse rounded-lg bg-border" />
                  ))}
                </div>
              ) : !isCalConnected ? (
                tier === 'free' ? (
                  <div className="rounded-lg border border-dashed border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <p className="text-sm font-medium text-foreground">{t('dashboard.calendar_locked_title')}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t('dashboard.calendar_connect_hint')}
                    </p>
                    <button
                      onClick={() => navigate('/pricing')}
                      className="text-xs font-medium text-primary hover:underline transition-colors"
                    >
                      {t('dashboard.discover_pro')}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.no_calendar')}{' '}
                    <button
                      onClick={() => navigate('/calendar')}
                      className="font-medium text-primary transition-colors hover:underline motion-reduce:transition-none"
                    >
                      {t('dashboard.connect_calendar')}
                    </button>
                  </p>
                )
              ) : upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('dashboard.no_upcoming')}
                </p>
              ) : (
                <ul className="space-y-2" role="list">
                  {upcomingEvents.map(event => (
                    <li key={event.id}>
                      <DashboardEventCard event={event} hasBriefing={hasBriefingData(event)} provider={event.provider} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── Right column ──────────────────────────────── */}
          <aside className="mt-10 space-y-4 lg:mt-0" aria-label={t('dashboard.summary_aria')}>

            {tier === 'free' && quotaSection}

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
                  {t('dashboard.recent')}
                </h2>
                <button
                  onClick={() => navigate('/archive')}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                >
                  {t('dashboard.view_all')}
                </button>
              </div>

              {recentMeetings === undefined ? (
                <div className="animate-pulse space-y-2.5">
                  {[0, 1, 2].map(i => <div key={i} className="h-8 rounded bg-border" />)}
                </div>
              ) : recentMeetings.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('dashboard.no_meetings')}</p>
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
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {meeting.title}
                          </p>
                          {(meeting.clientName || meeting.projectStream) && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {[meeting.clientName, meeting.projectStream].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <time
                            className="text-xs tabular-nums text-muted-foreground"
                            dateTime={new Date(meeting.startedAt).toISOString()}
                          >
                            {formatDateShort(meeting.startedAt)}
                          </time>
                          {tier === 'free' && (() => {
                            const expiresAt = meeting.startedAt + 7 * 24 * 60 * 60 * 1000
                            const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
                            if (daysLeft <= 0 || daysLeft > 7) return null
                            return (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                daysLeft <= 3
                                  ? 'bg-destructive/10 text-destructive'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                              }`}>
                                {daysLeft === 1 ? t('dashboard.expires_today') : t('dashboard.expires_in_days', { days: daysLeft })}
                              </span>
                            )
                          })()}
                        </div>
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
                  {t('dashboard.actions')}
                </h2>
                {tier !== 'free' ? (
                  <button
                    onClick={() => navigate('/actions')}
                    className="text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                  >
                    {t('dashboard.view_all_actions')}
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground opacity-60">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Pro
                  </span>
                )}
              </div>

              {openItems === undefined ? (
                <div className="animate-pulse space-y-2">
                  {[0, 1].map(i => <div key={i} className="h-6 rounded bg-border" />)}
                </div>
              ) : openCount === 0 ? (
                <p className="text-xs text-muted-foreground">{t('dashboard.no_actions')}</p>
              ) : (
                <>
                  <p className="mb-2.5">
                    <NumberTicker
                      value={openCount}
                      className="text-xl font-semibold text-foreground"
                    />
                    <span className="ml-1 text-xs text-muted-foreground">{t('dashboard.pending')}</span>
                  </p>
                  <ul className="space-y-2" role="list">
                    {topItems.map(item => {
                      const deadlineText = (() => {
                        const dl = item.dueDate
                        if (!dl) return null
                        const now = Date.now()
                        if (dl < now) return { text: t('dashboard.expired'), className: 'text-destructive' }
                        if (dl <= now + 3 * 24 * 60 * 60 * 1000)
                          return {
                            text: new Date(dl).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
                            className: 'text-amber-600 dark:text-amber-400',
                          }
                        return {
                          text: new Date(dl).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
                          className: 'text-primary',
                        }
                      })()

                      return (
                        <li key={item.id} className="flex items-start gap-2">
                          <span className="mt-1.25 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                          <p className="line-clamp-2 text-xs leading-snug text-foreground">
                            {item.text}
                            {deadlineText && (
                              <span className={`ml-1 ${deadlineText.className}`}>· {deadlineText.text}</span>
                            )}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </section>

            {tier !== 'free' && quotaSection}

            {/* Account */}
            <section
              className="rounded-lg border border-border bg-card px-4 py-4"
              aria-labelledby="account-heading"
            >
              <h2
                id="account-heading"
                className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
              >
                {t('dashboard.account_section')}
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">{email}</p>
                  {tier === 'unlimited' && <TierBadge tier={tier} />}
                </div>
                {billing?.billing_cycle && tier !== 'free' && (
                  <p className="text-xs text-muted-foreground">
                    {billing.billing_cycle === 'monthly' ? t('dashboard.plan_monthly') : t('dashboard.plan_annual')}
                  </p>
                )}
                {tier !== 'free' ? (
                  <button
                    onClick={handleManageSubscription}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                  >
                    {t('dashboard.manage_subscription')}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/pricing')}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                  >
                    {t('dashboard.upgrade_plan')}
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
