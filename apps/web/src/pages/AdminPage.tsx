import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'
import { fetchWhitelist, addToWhitelist, removeFromWhitelist, type WhitelistEntry } from '../lib/admin'
import i18n from '../i18n'

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

  // Whitelist state
  const [wlEntries, setWlEntries] = useState<WhitelistEntry[]>([])
  const [wlLoading, setWlLoading] = useState(true)
  const [wlError, setWlError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
                Aggiornato alle {lastUpdated.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
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

        {/* Whitelist anti-abuse */}
        <Section title="Whitelist anti-abuse">
          {wlLoading ? (
            <p className="text-sm text-gray-400">Caricamento...</p>
          ) : (
            <>
              {wlError && (
                <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {wlError}
                </div>
              )}

              {wlEntries.length === 0 ? (
                <p className="text-sm text-gray-400">Nessuna voce in whitelist</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {wlEntries.map(e => (
                    <div key={e.user_id} className="flex items-center justify-between text-sm gap-2 py-1">
                      <span className="text-gray-700 flex-1 truncate">{e.email ?? e.user_id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${e.reason === 'payment_auto' ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'}`}>
                        {e.reason === 'payment_auto' ? 'Pagamento auto' : 'Override manuale'}
                      </span>
                      <span className="text-gray-400 text-xs w-36 text-right">{formatDate(e.granted_at)}</span>
                      <span className="text-gray-500 text-xs flex-1 truncate">{e.notes ?? '—'}</span>
                      <button
                        onClick={() => handleRemove(e.user_id)}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
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
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-teal-600"
                />
                <input
                  type="text"
                  value={newNotes}
                  onChange={ev => setNewNotes(ev.target.value)}
                  placeholder="Note (opzionale)"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-teal-600"
                />
                <button
                  type="submit"
                  disabled={!newEmail || submitting}
                  className="rounded-lg bg-[#1A4D52] text-white px-4 py-2 text-sm hover:bg-[#163f44] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Aggiungo...' : 'Aggiungi alla whitelist'}
                </button>
              </form>
            </>
          )}
        </Section>

      </div>
    </div>
  )
}