import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { API_URL } from '../config'
import { fetchWhitelist, addToWhitelist, removeFromWhitelist, type WhitelistEntry } from '../lib/admin'
import { fetchComps, addComp, removeComp, type CompEntry, type CompTier } from '../lib/admin'
import i18n from '../i18n'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminStats {
  overview: {
    total_users: number
    mrr_eur: number
    budget_used_usd: number
    budget_cap_usd: number
  }
  tiers: { tier: string; cnt: number }[]
  synth_by_provider: {
    provider: string
    provider_count: number
    total_minutes: number
    total_cost: number
    total_fallbacks: number
  }[]
  top_users: { email: string; synthesis_minutes: number; synthesis_count: number }[]
  recent_signups: {
    email: string
    created_at: number
    tier: string | null
    flagged: number | null
    flag_reason: string | null
  }[]
  flagged_accounts: {
    email: string
    flag_reason: string
    created_at: number
  }[]
  thresholds_triggered: {
    email: string
    threshold_hours: number
    triggered_at: number
  }[]
  recent_webhooks: {
    event_id: string
    event_name: string
    processed_at: number
  }[]
  subscription_status: { status: string; cnt: number }[]
  cloud_veloce?: {
    total_minutes: number
    total_extra_minutes: number
    estimated_cost_usd: number
    budget_cap_eur: number
    budget_used_percent: number
    unique_users: number
    top_users: { email: string; minutes_used: number }[]
    distribution: { '0_1h': number; '1_3h': number; '3_5h': number; '5h_plus': number }
    alert_sent: boolean
  }
  extra_credits?: {
    orders_count: number
    revenue_gross_eur: number
    revenue_net_eur: number
    polar_fees_eur: number
    voxtral_cost_eur: number
    total_extra_minutes: number
    by_tier: { tier: string; extra_minutes: number; user_count: number }[]
    is_estimate: boolean
  }
  tech?: {
    errors_5xx_last_7d: null
    synthesis_errors_7d: { error_code: string; cnt: number }[]
    note: string
  }
  storage?: {
    blob_total_bytes: number
    meetings_count: number
    active_magic_tokens: number
    d1_row_counts: { table: string; count: number }[]
  }
  retention?: {
    canceled_this_month: number
    signups_last_30d: { date: string; count: number }[]
  }
  synthesis_cost_breakdown?: {
    synthesis_cost_usd: number
    transcription_cost_usd: number
    total_cost_usd: number
  }
}

// ─── Palette ─────────────────────────────────────────────────────────────────

const C_PRIMARY = '#1A4D52'
const C_AMBER   = '#C89868'
const C_MUTED   = '#9CA3AF'

const PIE_COLORS = [C_PRIMARY, C_AMBER, '#6B7A7B', C_MUTED]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(i18n.language, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function budgetColor(pct: number): string {
  if (pct >= 80) return 'bg-destructive'
  if (pct >= 50) return 'bg-amber-400'
  return 'bg-primary'
}

// ─── Layout primitives ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold text-primary">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {sub && <span className="text-xs text-muted-foreground/60">{sub}</span>}
    </div>
  )
}

function BudgetBar({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.min(pct, 100)
  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-2 rounded-full transition-all ${budgetColor(pct)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

// ─── Section: Cloud Veloce ────────────────────────────────────────────────────

function CloudVeloceSection({ cv }: { cv: NonNullable<AdminStats['cloud_veloce']> }) {
  const distData = [
    { name: '0–1h', value: cv.distribution['0_1h'] },
    { name: '1–3h', value: cv.distribution['1_3h'] },
    { name: '3–5h', value: cv.distribution['3_5h'] },
    { name: '5h+',  value: cv.distribution['5h_plus'] },
  ]

  return (
    <Section title="Cloud Veloce — mese corrente">
      {/* 4 stat boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Minuti trascritti" value={formatMinutes(cv.total_minutes)} />
        <Stat label="Utenti attivi" value={cv.unique_users} />
        <Stat label="Costo stimato" value={`$${cv.estimated_cost_usd.toFixed(2)}`} sub="Voxtral @$0.003/min" />
        <Stat
          label="Budget usato"
          value={`${cv.budget_used_percent.toFixed(1)}%`}
          sub={`cap €${cv.budget_cap_eur}`}
        />
      </div>

      {/* Budget bar */}
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1">
          <BudgetBar pct={cv.budget_used_percent} label="Budget Cloud Veloce mensile" />
        </div>
        {cv.alert_sent && (
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-4" aria-label="Alert 80% già inviato" />
        )}
      </div>

      {/* Pie + top users side by side on desktop */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Distribuzione utenti */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Distribuzione utenti per consumo</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={distData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {distData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip
                formatter={(val) => [`${val} utenti`]}
                contentStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {distData.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        {/* Top 5 utenti */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Top 5 utenti per minuti</p>
          {cv.top_users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun dato</p>
          ) : (
            <div className="flex flex-col gap-2">
              {cv.top_users.map((u, i) => (
                <div key={u.email} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground w-4">{i + 1}</span>
                  <span className="flex-1 truncate text-foreground">{u.email}</span>
                  <span className="text-muted-foreground">{formatMinutes(u.minutes_used)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {cv.total_extra_minutes > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Minuti extra acquistati: {cv.total_extra_minutes}min
        </p>
      )}
    </Section>
  )
}

// ─── Section: Extra Credits ───────────────────────────────────────────────────

function ExtraCreditsSection({ ec }: { ec: NonNullable<AdminStats['extra_credits']> }) {
  return (
    <Section title="Ricavi ore extra — mese corrente (stima)">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Ordini" value={ec.orders_count} />
        <Stat
          label="Ricavo lordo (est.)"
          value={`€${ec.revenue_gross_eur.toFixed(2)}`}
          sub="stima pacchetto medio"
        />
        <Stat
          label="Ricavo netto (est.)"
          value={`€${ec.revenue_net_eur.toFixed(2)}`}
          sub="al netto Polar + Voxtral"
        />
        <Stat
          label="Minuti extra venduti"
          value={formatMinutes(ec.total_extra_minutes)}
        />
      </div>

      {/* Breakdown costi */}
      {ec.revenue_gross_eur > 0 && (
        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Lordo <span className="font-semibold text-foreground">€{ec.revenue_gross_eur.toFixed(2)}</span>
          </span>
          <span className="text-muted-foreground">−</span>
          <span className="text-muted-foreground">
            Polar <span className="font-semibold text-foreground">€{ec.polar_fees_eur.toFixed(2)}</span>
            <span className="text-xs ml-1 opacity-60">(5.5% + €0.40/ord.)</span>
          </span>
          <span className="text-muted-foreground">−</span>
          <span className="text-muted-foreground">
            Voxtral <span className="font-semibold text-foreground">€{ec.voxtral_cost_eur.toFixed(2)}</span>
            <span className="text-xs ml-1 opacity-60">($0.003/min)</span>
          </span>
          <span className="text-muted-foreground">=</span>
          <span className="font-semibold text-foreground">
            Netto €{ec.revenue_net_eur.toFixed(2)}
          </span>
        </div>
      )}

      {/* Per tier */}
      {ec.by_tier.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-muted-foreground mb-2">Minuti extra per tier</p>
          <div className="flex flex-col gap-1.5">
            {ec.by_tier.map(t => (
              <div key={t.tier} className="flex items-center justify-between text-sm">
                <span className="capitalize text-foreground">{t.tier}</span>
                <span className="text-muted-foreground">
                  {t.user_count} {t.user_count === 1 ? 'utente' : 'utenti'} · {formatMinutes(t.extra_minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </Section>
  )
}

// ─── Section: Tech Health ─────────────────────────────────────────────────────

function TechHealthSection({ tech }: { tech: NonNullable<AdminStats['tech']> }) {
  const hasSynthErrors = tech.synthesis_errors_7d && tech.synthesis_errors_7d.length > 0

  return (
    <Section title="Health tecnico">
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Errori synthesis ultimi 7 giorni</p>
          {hasSynthErrors ? (
            <div className="flex flex-col gap-1">
              {tech.synthesis_errors_7d.map(e => (
                <div key={e.error_code} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-destructive">{e.error_code}</span>
                  <span className="tabular-nums text-muted-foreground">{e.cnt}×</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground">Nessun errore ✓</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-muted px-4 py-2.5 text-xs text-muted-foreground">
          {tech.note}
        </div>
      </div>
    </Section>
  )
}

// ─── Section: Storage ─────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function StorageSection({ storage }: { storage: NonNullable<AdminStats['storage']> }) {
  return (
    <Section title="Storage & Database">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Stat
          label="Dati meeting (R2)"
          value={formatBytes(storage.blob_total_bytes)}
          sub="spazio totale occupato"
        />
        <Stat
          label="Meeting archiviati"
          value={storage.meetings_count.toLocaleString()}
          sub="file in sync_blobs"
        />
        <Stat
          label="Magic link attivi"
          value={storage.active_magic_tokens}
          sub="non scaduti · non usati"
        />
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Righe D1</p>
        <div className="flex flex-col gap-1.5">
          {storage.d1_row_counts.map(row => (
            <div key={row.table} className="flex items-center justify-between text-sm">
              <span className="font-mono text-muted-foreground">{row.table}</span>
              <span className="font-semibold text-foreground tabular-nums">{row.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─── Section: Retention ───────────────────────────────────────────────────────

function RetentionSection({ retention }: { retention: NonNullable<AdminStats['retention']> }) {
  return (
    <Section title="Retention">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Stat label="Subscription cancellate (mese)" value={retention.canceled_this_month} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Signup ultimi 30 giorni</p>
          {retention.signups_last_30d.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun dato</p>
          ) : (
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={retention.signups_last_30d}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD4" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={d => d.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={24} />
                <ReTooltip contentStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={C_PRIMARY}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Section>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [wlEntries, setWlEntries] = useState<WhitelistEntry[]>([])
  const [wlLoading, setWlLoading] = useState(true)
  const [wlError, setWlError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [compEntries, setCompEntries] = useState<CompEntry[]>([])
  const [compLoading, setCompLoading] = useState(true)
  const [compError, setCompError] = useState<string | null>(null)
  const [compEmail, setCompEmail] = useState('')
  const [compTier, setCompTier] = useState<CompTier>('pro')
  const [compExpiry, setCompExpiry] = useState('')
  const [compNotes, setCompNotes] = useState('')
  const [compSubmitting, setCompSubmitting] = useState(false)

  async function loadWhitelist() {
    setWlLoading(true)
    setWlError(null)
    try {
      const entries = await fetchWhitelist()
      setWlEntries(entries)
    } catch (e) {
      setWlError(e instanceof Error ? e.message : 'fetch_failed')
    } finally {
      setWlLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setSubmitting(true)
    setWlError(null)
    try {
      await addToWhitelist(newEmail.trim(), newNotes.trim() || null)
      setNewEmail('')
      setNewNotes('')
      await loadWhitelist()
    } catch (err) {
      setWlError(err instanceof Error ? err.message : 'add_failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(userId: string) {
    if (!window.confirm('Rimuovere dalla whitelist?')) return
    setWlError(null)
    try {
      await removeFromWhitelist(userId)
      await loadWhitelist()
    } catch (err) {
      setWlError(err instanceof Error ? err.message : 'remove_failed')
    }
  }

  async function loadComps() {
    setCompLoading(true)
    setCompError(null)
    try {
      const entries = await fetchComps()
      setCompEntries(entries)
    } catch (e) {
      setCompError(e instanceof Error ? e.message : 'fetch_failed')
    } finally {
      setCompLoading(false)
    }
  }

  async function handleCompAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!compEmail.trim() || !compExpiry) return
    // datetime-local è ora locale: Date(...) la interpreta come locale, .getTime() dà ms UTC.
    const expiresAt = new Date(compExpiry).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setCompError('invalid_expiry')
      return
    }
    setCompSubmitting(true)
    setCompError(null)
    try {
      await addComp(compEmail.trim(), compTier, expiresAt, compNotes.trim() || null)
      setCompEmail('')
      setCompExpiry('')
      setCompNotes('')
      setCompTier('pro')
      await loadComps()
    } catch (err) {
      setCompError(err instanceof Error ? err.message : 'add_failed')
    } finally {
      setCompSubmitting(false)
    }
  }

  async function handleCompRemove(userId: string) {
    if (!window.confirm('Revocare il comp per questo utente?')) return
    setCompError(null)
    try {
      await removeComp(userId)
      await loadComps()
    } catch (err) {
      setCompError(err instanceof Error ? err.message : 'remove_failed')
    }
  }

  async function loadStats() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/admin/stats`, { credentials: 'include' })
      if (res.status === 403) {
        navigate('/dashboard')
        return
      }
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json() as AdminStats
      setStats(data)
      setLastUpdated(new Date())
    } catch {
      setError('Errore nel caricamento dei dati.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStats() }, [])
  useEffect(() => { loadWhitelist() }, [])
  useEffect(() => { loadComps() }, [])

  if (loading && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!stats) return null

  const cbd = stats.synthesis_cost_breakdown
  const budgetPercent = cbd
    ? Math.round((cbd.total_cost_usd / stats.overview.budget_cap_usd) * 100)
    : Math.round((stats.overview.budget_used_usd / stats.overview.budget_cap_usd) * 100)

  const totalSynths = stats.synth_by_provider.reduce((a, b) => a + b.provider_count, 0)
  const totalFallbacks = stats.synth_by_provider.reduce((a, b) => a + b.total_fallbacks, 0)
  const fallbackRate = totalSynths > 0 ? Math.round((totalFallbacks / totalSynths) * 100) : 0

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-primary" style={{ fontFamily: '"Instrument Serif", serif' }}>
              Founder Dashboard
            </h1>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Aggiornato alle {lastUpdated.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadStats}
              disabled={loading}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {loading ? 'Aggiornamento...' : '↻ Aggiorna'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm text-muted-foreground underline"
            >
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Overview */}
        <Section title="Overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Stat label="Utenti totali" value={stats.overview.total_users} />
            <Stat label="MRR stimato" value={`€${stats.overview.mrr_eur.toFixed(2)}`} sub="approssimativo" />
            <Stat
              label="Spesa LLM questo mese"
              value={`$${(cbd?.total_cost_usd ?? stats.overview.budget_used_usd).toFixed(2)}`}
              sub={`cap $${stats.overview.budget_cap_usd}`}
            />
            <Stat label="Sintesi (30gg)" value={totalSynths} sub={`fallback rate ${fallbackRate}%`} />
          </div>

          {/* Spesa breakdown */}
          {cbd && (
            <div className="mt-5 flex flex-wrap gap-4 text-sm">
              <span className="text-muted-foreground">
                Sintesi <span className="font-semibold text-foreground">${cbd.synthesis_cost_usd.toFixed(4)}</span>
              </span>
              <span className="text-muted-foreground">+</span>
              <span className="text-muted-foreground">
                Trascrizione <span className="font-semibold text-foreground">${cbd.transcription_cost_usd.toFixed(4)}</span>
              </span>
              <span className="text-muted-foreground">=</span>
              <span className="font-semibold text-foreground">
                Totale ${cbd.total_cost_usd.toFixed(4)}
              </span>
            </div>
          )}

          {/* Budget bar */}
          <BudgetBar pct={budgetPercent} label="Budget LLM + Trascrizione mensile" />
        </Section>

        {/* Cloud Veloce */}
        {stats.cloud_veloce && <CloudVeloceSection cv={stats.cloud_veloce} />}

        {/* Extra Credits */}
        {stats.extra_credits && <ExtraCreditsSection ec={stats.extra_credits} />}

        {/* Tier distribution + subscription status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Section title="Utenti per tier">
            <div className="flex flex-col gap-2">
              {stats.tiers.length === 0 && <p className="text-sm text-muted-foreground">Nessun dato</p>}
              {stats.tiers.map(t => (
                <div key={t.tier} className="flex justify-between text-sm">
                  <span className="text-foreground">
                    {{ free: 'Free', pro: 'Pro', unlimited: 'Pro Unlimited' }[t.tier] ?? t.tier}
                  </span>
                  <span className="font-semibold text-foreground">{t.cnt}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Subscription per status">
            <div className="flex flex-col gap-2">
              {stats.subscription_status.length === 0 && <p className="text-sm text-muted-foreground">Nessun dato</p>}
              {stats.subscription_status.map(s => (
                <div key={s.status} className="flex justify-between text-sm">
                  <span className="text-foreground capitalize">{s.status}</span>
                  <span className="font-semibold text-foreground">{s.cnt}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Sintesi per provider */}
        <Section title="Sintesi per provider (ultimi 30 giorni)">
          {stats.synth_by_provider.length === 0 && <p className="text-sm text-muted-foreground">Nessun dato</p>}
          <div className="flex flex-col gap-2">
            {stats.synth_by_provider.map(p => (
              <div key={p.provider} className="flex items-center justify-between text-sm">
                <span className="text-foreground w-32">{p.provider}</span>
                <span className="text-muted-foreground">{p.provider_count} sintesi</span>
                <span className="text-muted-foreground">{formatMinutes(p.total_minutes ?? 0)}</span>
                <span className="text-muted-foreground">${(p.total_cost ?? 0).toFixed(4)}</span>
                <span className="text-muted-foreground/60">{p.total_fallbacks} fallback</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Top users */}
        <Section title="Top 10 utenti per minuti (mese corrente)">
          {stats.top_users.length === 0 && <p className="text-sm text-muted-foreground">Nessun dato</p>}
          <div className="flex flex-col gap-2">
            {stats.top_users.map((u, i) => (
              <div key={u.email} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground w-5">{i + 1}</span>
                <span className="text-foreground flex-1 truncate">{u.email}</span>
                <span className="text-muted-foreground">{formatMinutes(u.synthesis_minutes)}</span>
                <span className="text-muted-foreground/60 ml-4">{u.synthesis_count} sintesi</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Ultimi signup */}
        <Section title="Ultimi 20 signup">
          {stats.recent_signups.length === 0 && <p className="text-sm text-muted-foreground">Nessun dato</p>}
          <div className="flex flex-col gap-2">
            {stats.recent_signups.map(u => (
              <div key={u.email + u.created_at} className="flex items-center justify-between text-sm gap-2">
                <span className="text-foreground flex-1 truncate">{u.email}</span>
                <span className="text-muted-foreground text-xs">{formatDate(u.created_at)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.tier && u.tier !== 'free' ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {u.tier ?? 'free'}
                </span>
                {u.flagged === 1 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                    ⚠ {u.flag_reason ?? 'flagged'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Health tecnico */}
        {stats.tech && <TechHealthSection tech={stats.tech} />}

        {/* Storage & Database */}
        {stats.storage && <StorageSection storage={stats.storage} />}

        {/* Retention */}
        {stats.retention && <RetentionSection retention={stats.retention} />}

        {/* Account flaggati */}
        <Section title="Account flaggati">
          {stats.flagged_accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun account flaggato ✓</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.flagged_accounts.map(a => (
                <div key={a.email + a.created_at} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-foreground flex-1 truncate">{a.email}</span>
                  <span className="text-xs text-destructive">{a.flag_reason}</span>
                  <span className="text-muted-foreground text-xs">{formatDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Soglie Pro Unlimited */}
        <Section title="Soglie Pro Unlimited triggerate (mese corrente)">
          {stats.thresholds_triggered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna soglia triggerata ✓</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.thresholds_triggered.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-foreground flex-1 truncate">{t.email}</span>
                  <span className="text-amber-500 font-semibold">{t.threshold_hours}h</span>
                  <span className="text-muted-foreground text-xs">{formatDate(t.triggered_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Webhook recenti */}
        <Section title="Ultimi 20 webhook pagamenti">
          {stats.recent_webhooks.length === 0 && <p className="text-sm text-muted-foreground">Nessun webhook ricevuto</p>}
          <div className="flex flex-col gap-2">
            {stats.recent_webhooks.map(w => (
              <div key={w.event_id} className="flex items-center justify-between text-sm gap-2">
                <span className="text-foreground text-xs font-mono">{w.event_name}</span>
                <span className="text-muted-foreground text-xs">{formatDate(w.processed_at)}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Whitelist anti-abuse */}
        <Section title="Whitelist anti-abuse">
          {wlLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : (
            <>
              {wlError && (
                <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {wlError}
                </div>
              )}

              {wlEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna voce in whitelist</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {wlEntries.map(e => (
                    <div key={e.user_id} className="flex items-center justify-between text-sm gap-2 py-1">
                      <span className="text-foreground flex-1 truncate">{e.email ?? e.user_id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${e.reason === 'payment_auto' ? 'bg-secondary text-primary' : 'bg-blue-50 text-blue-700'}`}>
                        {e.reason === 'payment_auto' ? 'Pagamento auto' : 'Override manuale'}
                      </span>
                      <span className="text-muted-foreground text-xs w-36 text-right">{formatDate(e.granted_at)}</span>
                      <span className="text-muted-foreground text-xs flex-1 truncate">{e.notes ?? '—'}</span>
                      <button
                        onClick={() => handleRemove(e.user_id)}
                        className="text-xs px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Elimina
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAdd} className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  value={newEmail}
                  onChange={ev => setNewEmail(ev.target.value)}
                  placeholder="email@esempio.it"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:border-primary"
                />
                <input
                  type="text"
                  value={newNotes}
                  onChange={ev => setNewNotes(ev.target.value)}
                  placeholder="Note (opzionale)"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!newEmail || submitting}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {submitting ? 'Aggiungo...' : 'Aggiungi alla whitelist'}
                </button>
              </form>
            </>
          )}
        </Section>

        {/* Comp utenze — tier manuale, gratis, separato da Polar */}
        <Section title="Comp utenze">
          {compLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : (
            <>
              {compError && (
                <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {compError}
                </div>
              )}

              {compEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun comp attivo</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {compEntries.map(c => (
                    <div key={c.user_id} className="flex items-center justify-between text-sm gap-2 py-1">
                      <span className="text-foreground flex-1 truncate">{c.email ?? c.user_id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.tier === 'unlimited' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                        {c.tier === 'unlimited' ? 'Unlimited' : 'Pro'}
                      </span>
                      <span className="text-muted-foreground text-xs w-36 text-right">scade {formatDate(c.expires_at)}</span>
                      <span className="text-muted-foreground text-xs flex-1 truncate">{c.notes ?? '—'}</span>
                      <button
                        onClick={() => handleCompRemove(c.user_id)}
                        className="text-xs px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Revoca
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleCompAdd} className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  value={compEmail}
                  onChange={ev => setCompEmail(ev.target.value)}
                  placeholder="email@esempio.it"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:border-primary"
                />
                <select
                  value={compTier}
                  onChange={ev => setCompTier(ev.target.value as CompTier)}
                  className="rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:border-primary"
                >
                  <option value="pro">Pro</option>
                  <option value="unlimited">Unlimited</option>
                </select>
                <input
                  type="datetime-local"
                  value={compExpiry}
                  onChange={ev => setCompExpiry(ev.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:border-primary"
                />
                <input
                  type="text"
                  value={compNotes}
                  onChange={ev => setCompNotes(ev.target.value)}
                  placeholder="Note (opzionale)"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!compEmail || !compExpiry || compSubmitting}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {compSubmitting ? 'Assegno...' : 'Assegna comp'}
                </button>
              </form>
            </>
          )}
        </Section>

      </div>
    </div>
  )
}
