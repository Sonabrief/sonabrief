import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMe, getBillingStatus, getBillingPortalUrl,
  getPreferences, updatePreferences,
} from '../lib/api'
import { API_URL } from '../config'
import { AppNav } from '../components/AppNav'
import { Button } from '../components/ui/button'

const PROFESSIONS: { category: string; items: string[] }[] = [
  {
    category: 'Consulenza & Finanza',
    items: [
      'Consulente finanziario / Wealth manager',
      'Commercialista / Revisore contabile',
      'Consulente aziendale / Management consultant',
      'Analista finanziario / Investment analyst',
    ],
  },
  {
    category: 'Legal',
    items: ['Avvocato / Legale', 'Notaio', 'Consulente legale in-house'],
  },
  {
    category: 'Salute & Benessere',
    items: [
      'Medico / Specialista',
      'Psicologo / Psicoterapeuta',
      'Assistente sociale / Case manager',
      'Nutrizionista / Fisioterapista',
    ],
  },
  {
    category: 'Tecnologia & Prodotto',
    items: [
      'Product Manager',
      'Project Manager',
      'Engineering Manager / CTO',
      'Consulente IT / System integrator',
    ],
  },
  {
    category: 'Marketing & Comunicazione',
    items: [
      'Account / Client Manager',
      'Consulente marketing / PR',
      'Responsabile comunicazione',
    ],
  },
  {
    category: 'Vendite & Business Development',
    items: ['Sales Manager / Account Executive', 'Business Developer', 'Recruiter / HR Manager'],
  },
  {
    category: 'Ricerca & Formazione',
    items: [
      'Ricercatore / Accademico',
      'Giornalista investigativo',
      'Formatore / Coach / Trainer',
      'Studente universitario / Dottorando',
    ],
  },
  {
    category: 'Nonprofit & Pubblico',
    items: ['Manager nonprofit / ONG', 'Funzionario pubblico / PA'],
  },
  {
    category: 'Founder & Management',
    items: ['Founder / CEO', 'Dirigente aziendale / C-suite'],
  },
  {
    category: 'Altro',
    items: ['Libero professionista (altro settore)', 'Dipendente aziendale (altro ruolo)'],
  },
]

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  unlimited: 'Pro Unlimited',
}

const LANGUAGE_OPTIONS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
]

const MODE_OPTIONS = [
  { value: 'standard', label: 'Standard', description: 'Trascrizione locale, sintesi cloud' },
  { value: 'local', label: 'Solo locale', description: 'Tutto sul tuo computer' },
]

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="text-sm text-foreground text-right">{children}</div>
    </div>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState('free')
  const [billingCycle, setBillingCycle] = useState<string | null>(null)
  const [quotaUsed, setQuotaUsed] = useState(0)
  const [quotaCap, setQuotaCap] = useState(300)
  const [language, setLanguage] = useState('it')
  const [defaultMode, setDefaultMode] = useState('standard')
  const [profession, setProfession] = useState('')
  const [professionSearch, setProfessionSearch] = useState('')
  const [professionOpen, setProfessionOpen] = useState(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  const filteredProfessions = useMemo(() =>
    professionSearch.trim()
      ? PROFESSIONS.map(cat => ({
          ...cat,
          items: cat.items.filter(item =>
            item.toLowerCase().includes(professionSearch.toLowerCase())
          ),
        })).filter(cat => cat.items.length > 0)
      : PROFESSIONS
  , [professionSearch])

  useEffect(() => {
    getMe().then(u => { if (u) setEmail(u.email) })
    getBillingStatus().then(b => {
      if (!b) return
      setTier(b.tier ?? 'free')
      setBillingCycle(b.billing_cycle ?? null)
      setQuotaUsed(b.quota_used_minutes ?? 0)
      setQuotaCap(b.quota_cap_minutes ?? 300)
    })
    getPreferences().then(p => {
      if (!p) return
      setLanguage(p.language ?? 'it')
      setDefaultMode(p.synthesis_mode ?? 'standard')
      setProfession(p.profession ?? '')
      setPrefsLoaded(true)
    })
  }, [])

  async function handleSavePrefs() {
    setSaving(true)
    await updatePreferences({ language, synthesis_mode: defaultMode, profession })
    setSaving(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  async function handlePortal() {
    setPortalLoading(true)
    const url = await getBillingPortalUrl()
    setPortalLoading(false)
    if (url) window.open(url, '_blank')
  }

  async function handleDeleteAccount() {
    if (deleteInput.toLowerCase() !== 'elimina') return
    setDeleting(true)
    try {
      await fetch(`${API_URL}/v1/account`, {
        method: 'DELETE',
        credentials: 'include',
      })
      navigate('/', { replace: true })
    } catch {
      setDeleting(false)
    }
  }

  function formatMinutes(m: number) {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return `${min} min`
    if (min === 0) return `${h}h`
    return `${h}h ${min}m`
  }

  const percentUsed = quotaCap > 0 ? Math.min(100, Math.round((quotaUsed / quotaCap) * 100)) : 0

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-heading text-2xl font-semibold text-foreground mb-8">
          Profilo
        </h1>

        <div className="space-y-8">

          {/* ── Account ─────────────────────────────────── */}
          <section aria-labelledby="account-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="account-heading">Account</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5">
              <Row label="Email">
                <span className="text-muted-foreground">{email || '—'}</span>
              </Row>
              <Row label="Piano">
                <span className="font-medium">{TIER_LABEL[tier] ?? tier}</span>
              </Row>
              {billingCycle && tier !== 'free' && (
                <Row label="Ciclo">
                  {billingCycle === 'monthly' ? 'Mensile' : 'Annuale'}
                </Row>
              )}
            </div>
          </section>

          {/* ── Piano ───────────────────────────────────── */}
          <section aria-labelledby="piano-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="piano-heading">Piano e quota</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
              {tier !== 'unlimited' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Sintesi cloud questo mese</span>
                    <span className="text-sm tabular-nums text-foreground">
                      {formatMinutes(quotaUsed)} / {formatMinutes(quotaCap)}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={percentUsed}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${percentUsed}% della quota utilizzata`}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
                        percentUsed > 80 ? 'bg-destructive' : 'bg-primary'
                      }`}
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                </div>
              )}
              {tier === 'unlimited' && (
                <p className="text-sm text-muted-foreground">
                  Sintesi cloud fair-use — nessun limite mensile.
                </p>
              )}
              <div className="pt-1">
                {tier === 'free' ? (
                  <Button
                    onClick={() => navigate('/pricing')}
                    className="h-9 px-5 text-sm"
                  >
                    Passa a Pro
                  </Button>
                ) : (
                  <button
                    onClick={handlePortal}
                    disabled={portalLoading}
                    className="text-sm font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none disabled:opacity-50"
                  >
                    {portalLoading ? 'Apertura…' : 'Gestisci abbonamento'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── Preferenze ──────────────────────────────── */}
          <section aria-labelledby="prefs-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="prefs-heading">Preferenze</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="language-select" className="text-sm text-muted-foreground">
                  Lingua
                </label>
                <select
                  id="language-select"
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {LANGUAGE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mode-select" className="text-sm text-muted-foreground">
                  Modalità sintesi predefinita
                </label>
                <select
                  id="mode-select"
                  value={defaultMode}
                  onChange={e => setDefaultMode(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {MODE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label} — {o.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profession-search" className="text-sm text-muted-foreground">
                  Professione
                </label>
                <div className="relative">
                  <input
                    id="profession-search"
                    type="text"
                    value={professionOpen ? professionSearch : profession}
                    onFocus={() => { setProfessionOpen(true); setProfessionSearch('') }}
                    onBlur={() => setTimeout(() => setProfessionOpen(false), 150)}
                    onChange={e => setProfessionSearch(e.target.value)}
                    placeholder="Cerca la tua professione..."
                    className="w-full rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    ↓
                  </span>
                </div>
                {professionOpen && (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                    {filteredProfessions.map(cat => (
                      <div key={cat.category}>
                        <p className="sticky top-0 bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b border-border">
                          {cat.category}
                        </p>
                        {cat.items.map(item => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => { setProfession(item); setProfessionSearch('') }}
                            aria-pressed={profession === item}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors motion-reduce:transition-none ${
                              profession === item
                                ? 'bg-secondary text-primary'
                                : 'text-foreground hover:bg-border'
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-1 flex items-center gap-3">
                <Button
                  onClick={handleSavePrefs}
                  disabled={saving || !prefsLoaded}
                  className="h-9 px-5 text-sm"
                >
                  {saving ? 'Salvataggio…' : 'Salva preferenze'}
                </Button>
                {saveSuccess && (
                  <span role="status" className="text-sm text-muted-foreground">
                    Salvato.
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ── Privacy & Dati ──────────────────────────── */}
          <section aria-labelledby="privacy-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="privacy-heading">Privacy e dati</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                I tuoi audio non lasciano mai il tuo computer. Le sintesi e le note
                sono cifrate con zero-knowledge quando usi la modalità Synced.
              </p>
              <div className="border-t border-border pt-4">
                {!deleteConfirm ? (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="text-sm text-destructive transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transition-none"
                  >
                    Elimina account
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-foreground font-medium">
                      Questa azione è irreversibile.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tutti i tuoi dati verranno eliminati permanentemente.
                      Scrivi <strong className="text-foreground">elimina</strong> per confermare.
                    </p>
                    <input
                      type="text"
                      value={deleteInput}
                      onChange={e => setDeleteInput(e.target.value)}
                      placeholder="elimina"
                      autoComplete="off"
                      className="w-full rounded-md border border-destructive bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                      aria-label="Conferma eliminazione account"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteInput.toLowerCase() !== 'elimina' || deleting}
                        className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-40 motion-reduce:transition-none"
                      >
                        {deleting ? 'Eliminazione…' : 'Elimina definitivamente'}
                      </button>
                      <button
                        onClick={() => { setDeleteConfirm(false); setDeleteInput('') }}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}