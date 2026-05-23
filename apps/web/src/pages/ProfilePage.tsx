import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import {
  getMe, getBillingStatus, getBillingPortalUrl,
  getPreferences, updatePreferences, updateDisplayName,
} from '../lib/api'
import { API_URL } from '../config'
import { AppNav } from '../components/AppNav'
import { Button } from '../components/ui/button'
import {
  isWebAuthnSupported,
  listPasskeys,
  registerPasskey,
  deletePasskey,
  type PasskeyCredential,
} from '../lib/webauthn'
import { useBackupScheduler, type BackupFrequency } from '../hooks/useBackupScheduler'
import { ProGate } from '../components/ProGate'
import { cn } from '@/lib/utils'
import { setModelOverride, detectWhisperModel, WHISPER_LARGE, WHISPER_SMALL, type WhisperModelId } from '../lib/whisperModel'
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
}

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
  const [displayName, setDisplayName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
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
  const passkeySupported = useMemo(() => isWebAuthnSupported(), [])
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([])
  const [passkeyDeviceName, setPasskeyDeviceName] = useState('')
  const [passkeyAdding, setPasskeyAdding] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [backupFrequency, setBackupFrequency] = useState<BackupFrequency>('24h')
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  const [backupRunning, setBackupRunning] = useState(false)
  const [weeklyReminder, setWeeklyReminder] = useState(false)
  const [whisperOverride, setWhisperOverride] = useState<WhisperModelId | null>(null)
  const detectedModel = useMemo(() => detectWhisperModel(), [])

  useBackupScheduler(tier, backupFrequency, (at) => setLastBackupAt(at))

  async function refreshPasskeys() {
    try {
      const list = await listPasskeys()
      setPasskeys(list)
    } catch {
      // Silenzioso: utente vede la lista vuota se la chiamata fallisce
    }
  }

  async function handleAddPasskey() {
    if (!passkeyDeviceName.trim()) return
    setPasskeyAdding(true)
    setPasskeyError(null)
    try {
      await registerPasskey(passkeyDeviceName.trim())
      setPasskeyDeviceName('')
      await refreshPasskeys()
    } catch (err) {
      console.error('[passkey register]', err)
      const name = (err as Error & { name?: string })?.name
      if (name === 'NotAllowedError') {
        setPasskeyError('Operazione annullata')
      } else {
        setPasskeyError('Impossibile aggiungere la passkey. Riprova.')
      }
    }
    setPasskeyAdding(false)
  }

  async function handleDeletePasskey(id: string) {
    if (!window.confirm('Eliminare questa passkey?')) return
    try {
      await deletePasskey(id)
      await refreshPasskeys()
    } catch {
      setPasskeyError('Impossibile eliminare la passkey. Riprova.')
    }
  }

  function formatPasskeyDate(ts: number | null): string {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

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
    getMe().then(u => {
      if (u) {
        setEmail(u.email)
        if (u.display_name) setDisplayName(u.display_name)
      }
    })
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
      setWeeklyReminder(p.weekly_reminder_enabled === 1)
      setPrefsLoaded(true)
    })
    if (passkeySupported) {
      refreshPasskeys()
    }
  }, [passkeySupported])

  useEffect(() => {
    const saved = localStorage.getItem('sb_last_backup_at')
    if (saved) setLastBackupAt(Number(saved))
    const freq = localStorage.getItem('sb_backup_frequency') as BackupFrequency | null
    if (freq) setBackupFrequency(freq)
    const override = localStorage.getItem('whisper_model_override') as WhisperModelId | null
    setWhisperOverride(override)
  }, [])

  async function handleSavePrefs() {
    setSaving(true)
    await updatePreferences({ language, synthesis_mode: defaultMode, profession })
    setSaving(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  async function handleSaveName() {
    if (!nameInput.trim()) return
    setNameSaving(true)
    await updateDisplayName(nameInput.trim())
    setDisplayName(nameInput.trim())
    setEditingName(false)
    setNameSaving(false)
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

  function formatBackupDate(ts: number | null): string {
    if (!ts) return 'Mai'
    return new Date(ts).toLocaleString('it-IT', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleManualBackup() {
    setBackupRunning(true)
    try {
      const { syncAllMeetings } = await import('../lib/sync')
      const result = await syncAllMeetings()
      setLastBackupAt(result.lastSyncedAt)
    } catch (err) {
      console.error('[backup] error:', err)
    }
    setBackupRunning(false)
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-heading text-2xl font-semibold text-foreground mb-8">
          Profilo
        </h1>

        <div className="space-y-8">

          {/* ── Account ─────────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0 }} aria-labelledby="account-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="account-heading">Account</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5">
              <Row label="Nome">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveName() }}
                      autoFocus
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={nameSaving || !nameInput.trim()}
                      className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      {nameSaving ? 'Salvo…' : 'Salva'}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-foreground">{displayName || '—'}</span>
                    <button
                      onClick={() => { setNameInput(displayName); setEditingName(true) }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      Modifica
                    </button>
                  </div>
                )}
              </Row>
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
          </motion.section>

          {/* ── Passkey ─────────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.03 }} aria-labelledby="passkey-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="passkey-heading">Passkey</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
              {!passkeySupported ? (
                <p className="text-sm text-muted-foreground">
                  Le passkey non sono supportate su questo browser.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Accedi senza email con il riconoscimento biometrico del tuo dispositivo.
                  </p>

                  {passkeys.length > 0 && (
                    <ul className="space-y-2">
                      {passkeys.map(pk => (
                        <li
                          key={pk.id}
                          className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {pk.device_name || 'Dispositivo senza nome'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Aggiunta il {formatPasskeyDate(pk.created_at)}
                              {pk.last_used_at && ` · Ultimo uso ${formatPasskeyDate(pk.last_used_at)}`}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeletePasskey(pk.id)}
                            className="shrink-0 text-sm text-destructive transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transition-none"
                          >
                            Elimina
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-2">
                    <label htmlFor="passkey-device-name" className="text-sm text-muted-foreground">
                      Nome dispositivo
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="passkey-device-name"
                        type="text"
                        value={passkeyDeviceName}
                        onChange={e => setPasskeyDeviceName(e.target.value)}
                        placeholder="MacBook Pro, iPhone…"
                        className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <Button
                        onClick={handleAddPasskey}
                        disabled={passkeyAdding || !passkeyDeviceName.trim()}
                        className="h-9 px-4 text-sm"
                      >
                        {passkeyAdding ? 'Aggiunta…' : 'Aggiungi passkey'}
                      </Button>
                    </div>
                    {passkeyError && (
                      <p role="alert" className="text-sm text-destructive">
                        {passkeyError}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.section>

          {/* ── Piano ───────────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.06 }} aria-labelledby="piano-heading">
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
          </motion.section>

          {/* ── Preferenze ──────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }} aria-labelledby="prefs-heading">
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
                <AnimatePresence>
                  {saveSuccess && (
                    <motion.span
                      role="status"
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-sm text-muted-foreground"
                    >
                      Salvato.
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.section>
          {/* ── Trascrizione ────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.14 }} aria-labelledby="transcription-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="transcription-heading">Trascrizione</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Modello Whisper usato per trascrivere i tuoi meeting. Il rilevamento automatico sceglie in base all'hardware del tuo computer.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="whisper-model-select" className="text-sm text-muted-foreground">
                  Modello di trascrizione
                </label>
                <select
                  id="whisper-model-select"
                  value={whisperOverride ?? 'auto'}
                  onChange={e => {
                    const v = e.target.value
                    if (v === 'auto') {
                      setModelOverride(null)
                      setWhisperOverride(null)
                    } else {
                      setModelOverride(v as WhisperModelId)
                      setWhisperOverride(v as WhisperModelId)
                    }
                  }}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="auto">
                    Automatico (rilevato: {detectedModel === WHISPER_LARGE ? 'Large-v3-turbo' : 'Small'})
                  </option>
                  <option value={WHISPER_LARGE}>Large-v3-turbo — qualità massima (~800 MB)</option>
                  <option value={WHISPER_SMALL}>Small — compatibile con hardware limitato (~470 MB)</option>
                </select>
              </div>
              {whisperOverride && (
                <p className="text-xs text-muted-foreground">
                  Override manuale attivo. Le modifiche hanno effetto dalla prossima registrazione.
                </p>
              )}
            </div>
          </motion.section>

          {/* ── Notifiche email ─────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.16 }} aria-labelledby="notifications-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="notifications-heading">Notifiche email</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Reminder action items settimanale</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ogni lunedì alle 8:00 ricevi un riepilogo degli action items aperti.</p>
                </div>
                <ProGate feature="Reminder email">
                  <button
                    role="switch"
                    aria-checked={weeklyReminder}
                    onClick={async () => {
                      const next = !weeklyReminder
                      setWeeklyReminder(next)
                      await updatePreferences({ weekly_reminder_enabled: next ? 1 : 0 })
                    }}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      weeklyReminder ? 'bg-primary' : 'bg-muted'
                    )}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform',
                      weeklyReminder ? 'translate-x-5' : 'translate-x-0'
                    )} />
                  </button>
                </ProGate>
              </div>
            </div>
          </motion.section>

          {/* ── Backup automatico ───────────────────────── */}
          {tier === 'unlimited' && (
            <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.15 }} aria-labelledby="backup-heading">
              <div className="mb-4">
                <SectionHeading>
                  <span id="backup-heading">Backup automatico</span>
                </SectionHeading>
              </div>
              <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I tuoi meeting vengono cifrati sul tuo computer e sincronizzati su cloud automaticamente.
                  Nemmeno noi possiamo leggerli.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor="backup-freq" className="text-sm text-muted-foreground">
                    Frequenza backup
                  </label>
                  <select
                    id="backup-freq"
                    value={backupFrequency}
                    onChange={e => {
                      const v = e.target.value as BackupFrequency
                      setBackupFrequency(v)
                      localStorage.setItem('sb_backup_frequency', v)
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="1h">Ogni ora</option>
                    <option value="6h">Ogni 6 ore</option>
                    <option value="24h">Giornaliero (default)</option>
                    <option value="off">Disattivato</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Ultimo backup: <span className="text-foreground">{formatBackupDate(lastBackupAt)}</span>
                  </span>
                  <Button
                    onClick={handleManualBackup}
                    disabled={backupRunning}
                    className="h-9 px-4 text-sm"
                    variant="outline"
                  >
                    {backupRunning ? 'Backup…' : 'Esegui ora'}
                  </Button>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── Privacy & Dati ──────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.18 }} aria-labelledby="privacy-heading">
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
              <a
                href="/docs/whitepaper-privacy.md"
                download="Sonabrief-Whitepaper-Privacy.md"
                className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
              >
                Scarica whitepaper architettura privacy (PDF)
              </a>
              <div className="border-t border-border pt-4">
                <AnimatePresence mode="wait">
                  {!deleteConfirm ? (
                    <motion.div
                      key="delete-trigger"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="text-sm text-destructive transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transition-none"
                      >
                        Elimina account
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="delete-confirm"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-3"
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.section>

        </div>
      </main>
    </div>
  )
}