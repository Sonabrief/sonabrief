import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'

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
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('it-IT', {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold text-[#1A4D52]">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

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

  if (loading && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
        <p className="text-sm text-gray-400">Caricamento...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  if (!stats) return null

  const budgetPercent = Math.round((stats.overview.budget_used_usd / stats.overview.budget_cap_usd) * 100)
  const totalSynths = stats.synth_by_provider.reduce((a, b) => a + b.provider_count, 0)
  const totalFallbacks = stats.synth_by_provider.reduce((a, b) => a + b.total_fallbacks, 0)
  const fallbackRate = totalSynths > 0 ? Math.round((totalFallbacks / totalSynths) * 100) : 0

  return (
    <div className="min-h-screen bg-[#FAF7F0] px-6 py-10">
      <div className="mx-auto max-w-5xl flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A4D52]" style={{ fontFamily: '"Instrument Serif", serif' }}>
              Founder Dashboard
            </h1>
            {lastUpdated && (
              <p className="text-xs text-gray-400 mt-0.5">
                Aggiornato alle {lastUpdated.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadStats}
              disabled={loading}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-teal-600 hover:text-teal-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Aggiornamento...' : '↻ Aggiorna'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm text-gray-400 underline"
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
              value={`$${stats.overview.budget_used_usd.toFixed(2)}`}
              sub={`cap $${stats.overview.budget_cap_usd}`}
            />
            <Stat label="Sintesi (30gg)" value={totalSynths} sub={`fallback rate ${fallbackRate}%`} />
          </div>

          {/* Budget bar */}
          <div className="mt-6">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Budget LLM mensile</span>
              <span>{budgetPercent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className={`h-2 rounded-full transition-all ${budgetPercent > 80 ? 'bg-red-400' : 'bg-[#1A4D52]'}`}
                style={{ width: `${Math.min(budgetPercent, 100)}%` }}
              />
            </div>
          </div>
        </Section>

        {/* Tier distribution + subscription status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Section title="Utenti per tier">
            <div className="flex flex-col gap-2">
              {stats.tiers.length === 0 && <p className="text-sm text-gray-400">Nessun dato</p>}
              {stats.tiers.map(t => (
                <div key={t.tier} className="flex justify-between text-sm">
                  <span className="text-gray-700 capitalize">{t.tier}</span>
                  <span className="font-medium text-gray-900">{t.cnt}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Subscription per status">
            <div className="flex flex-col gap-2">
              {stats.subscription_status.length === 0 && <p className="text-sm text-gray-400">Nessun dato</p>}
              {stats.subscription_status.map(s => (
                <div key={s.status} className="flex justify-between text-sm">
                  <span className="text-gray-700 capitalize">{s.status}</span>
                  <span className="font-medium text-gray-900">{s.cnt}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Sintesi per provider */}
        <Section title="Sintesi per provider (ultimi 30 giorni)">
          {stats.synth_by_provider.length === 0 && <p className="text-sm text-gray-400">Nessun dato</p>}
          <div className="flex flex-col gap-2">
            {stats.synth_by_provider.map(p => (
              <div key={p.provider} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 w-32">{p.provider}</span>
                <span className="text-gray-500">{p.provider_count} sintesi</span>
                <span className="text-gray-500">{formatMinutes(p.total_minutes ?? 0)}</span>
                <span className="text-gray-500">${(p.total_cost ?? 0).toFixed(4)}</span>
                <span className="text-gray-400">{p.total_fallbacks} fallback</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Top users */}
        <Section title="Top 10 utenti per minuti (mese corrente)">
          {stats.top_users.length === 0 && <p className="text-sm text-gray-400">Nessun dato</p>}
          <div className="flex flex-col gap-2">
            {stats.top_users.map((u, i) => (
              <div key={u.email} className="flex items-center justify-between text-sm">
                <span className="text-gray-400 w-5">{i + 1}</span>
                <span className="text-gray-700 flex-1 truncate">{u.email}</span>
                <span className="text-gray-500">{formatMinutes(u.synthesis_minutes)}</span>
                <span className="text-gray-400 ml-4">{u.synthesis_count} sintesi</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Ultimi signup */}
        <Section title="Ultimi 20 signup">
          {stats.recent_signups.length === 0 && <p className="text-sm text-gray-400">Nessun dato</p>}
          <div className="flex flex-col gap-2">
            {stats.recent_signups.map(u => (
              <div key={u.email + u.created_at} className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-700 flex-1 truncate">{u.email}</span>
                <span className="text-gray-400 text-xs">{formatDate(u.created_at)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.tier && u.tier !== 'free' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                  {u.tier ?? 'free'}
                </span>
                {u.flagged === 1 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                    ⚠ {u.flag_reason ?? 'flagged'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Account flaggati */}
        <Section title="Account flaggati">
          {stats.flagged_accounts.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun account flaggato ✓</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.flagged_accounts.map(a => (
                <div key={a.email + a.created_at} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-gray-700 flex-1 truncate">{a.email}</span>
                  <span className="text-xs text-red-600">{a.flag_reason}</span>
                  <span className="text-gray-400 text-xs">{formatDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Soglie Pro Unlimited */}
        <Section title="Soglie Pro Unlimited triggerate (mese corrente)">
          {stats.thresholds_triggered.length === 0 ? (
            <p className="text-sm text-gray-400">Nessuna soglia triggerata ✓</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.thresholds_triggered.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-gray-700 flex-1 truncate">{t.email}</span>
                  <span className="text-amber-600 font-medium">{t.threshold_hours}h</span>
                  <span className="text-gray-400 text-xs">{formatDate(t.triggered_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Webhook recenti */}
        <Section title="Ultimi 20 webhook Lemon Squeezy">
          {stats.recent_webhooks.length === 0 && <p className="text-sm text-gray-400">Nessun webhook ricevuto</p>}
          <div className="flex flex-col gap-2">
            {stats.recent_webhooks.map(w => (
              <div key={w.event_id} className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-700 text-xs font-mono">{w.event_name}</span>
                <span className="text-gray-400 text-xs">{formatDate(w.processed_at)}</span>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  )
}