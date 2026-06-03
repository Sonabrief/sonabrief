import { useEffect, useMemo, useState } from 'react'
import { getProfessionLabel } from '../lib/professionSlugs'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { cn } from '@/lib/utils'
import { setModelOverride, detectWhisperModel, WHISPER_LARGE, WHISPER_SMALL, type WhisperModelId } from '../lib/whisperModel'
import { ChevronDown, Lock } from 'lucide-react'
import { OllamaSetupFlow } from '../components/local-mode'
import i18n from '../i18n'
const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
}


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

// MODE_OPTIONS built inside the component to use t()

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-foreground">
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
  const { t } = useTranslation()
  const navigate = useNavigate()

  const MODE_OPTIONS = [
    { value: 'standard', label: t('profile.mode_standard_label'), description: t('profile.mode_standard') },
    { value: 'local', label: t('profile.mode_local_label'), description: t('profile.mode_local') },
  ]

  const PROFESSIONS = t('onboarding.professions', { returnObjects: true }) as { category: string; items: { slug: string; label: string }[] }[]
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [tier, setTier] = useState('free')
  const [billingCycle, setBillingCycle] = useState<string | null>(null)
  const [quotaUsed, setQuotaUsed] = useState(0)
  const [quotaCap, setQuotaCap] = useState(300)
  const [language, setLanguage] = useState(i18n.language)
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
  const [calendarConnected, setCalendarConnected] = useState<{ google: boolean; microsoft: boolean }>({ google: false, microsoft: false })
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [showSyncDisableConfirm, setShowSyncDisableConfirm] = useState(false)
  const [showOllamaModal, setShowOllamaModal] = useState(false)

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
        setPasskeyError(t('profile.passkey_error_cancelled'))
      } else {
        setPasskeyError(t('profile.passkey_error_add'))
      }
    }
    setPasskeyAdding(false)
  }

  async function handleDeletePasskey(id: string) {
    if (!window.confirm(t('profile.passkey_delete_confirm'))) return
    try {
      await deletePasskey(id)
      await refreshPasskeys()
    } catch {
      setPasskeyError(t('profile.passkey_error_delete'))
    }
  }

  function formatPasskeyDate(ts: number | null): string {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString(i18n.language, {
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
            item.label.toLowerCase().includes(professionSearch.toLowerCase())
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
      setSyncEnabled(p.sync_enabled === 1 || localStorage.getItem('sonabrief_sync_enabled') === 'true')
      setPrefsLoaded(true)
    })
    if (passkeySupported) {
      refreshPasskeys()
    }
    Promise.all([
      fetch(`${API_URL}/v1/calendar/events`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/v1/calendar/microsoft/events`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([g, m]) => {
      setCalendarConnected({ google: !!g?.connected, microsoft: !!m?.connected })
    })
  }, [passkeySupported])

  useEffect(() => {
    localStorage.removeItem('sb_theme')
    localStorage.removeItem('sb_preferences')
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
    i18n.changeLanguage(language)
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
    if (url) {
      window.open(url, '_blank')
    } else {
      toast.error(t('profile.error'), { description: t('profile.billing_portal_error') })
    }
  }

  async function handleDeleteAccount() {
    if (deleteInput.toLowerCase() !== t('profile.delete_confirm_word')) return
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
    if (!ts) return t('profile.never')
    return new Date(ts).toLocaleString(i18n.language, {
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
          {t('profile.title')}
        </h1>

        <div className="space-y-8">

          {/* ── Account ─────────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0 }} aria-labelledby="account-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="account-heading">{t('profile.account_section')}</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5">
              <Row label={t('profile.name_label')}>
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
                      {nameSaving ? t('profile.saving') : t('profile.save')}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      {t('profile.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-foreground">{displayName || '—'}</span>
                    <button
                      onClick={() => { setNameInput(displayName); setEditingName(true) }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      {t('profile.edit')}
                    </button>
                  </div>
                )}
              </Row>
              <Row label={t('profile.email_label')}>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-muted-foreground">{email || '—'}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('profile.email_change_hint')}{' '}
                    <a href="mailto:hello@sonabrief.com" className="text-primary hover:underline">
                      {t('profile.email_change_link')}
                    </a>
                  </span>
                </div>
              </Row>
              <Row label={t('profile.plan_label')}>
                <span className="font-medium">{TIER_LABEL[tier] ?? tier}</span>
              </Row>
              {billingCycle && tier !== 'free' && (
                <Row label={t('profile.billing_cycle_label')}>
                  {billingCycle === 'monthly' ? t('profile.monthly') : t('profile.annual')}
                </Row>
              )}
              <Row label={t('profile.calendar_label')}>
                <div className="flex flex-col items-end gap-1">
                  {!calendarConnected.google && !calendarConnected.microsoft ? (
                    <span className="text-xs text-muted-foreground">{t('profile.no_calendar')}</span>
                  ) : (
                    <>
                      {calendarConnected.google && (
                        <span className="text-xs text-foreground">Google Calendar ✓</span>
                      )}
                      {calendarConnected.microsoft && (
                        <span className="text-xs text-foreground">Microsoft 365 ✓</span>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => navigate('/calendar')}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('profile.manage_link')}
                  </button>
                </div>
              </Row>
            </div>
          </motion.section>

          {/* ── Passkey ─────────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.03 }} aria-labelledby="passkey-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="passkey-heading">{t('profile.security_section')}</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
              {!passkeySupported ? (
                <p className="text-sm text-muted-foreground">
                  {t('profile.passkey_unsupported')}
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('profile.passkey_hint')}
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
                              {pk.device_name || t('profile.passkey_unnamed')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('profile.passkey_added_at', { date: formatPasskeyDate(pk.created_at) })}
                              {pk.last_used_at && ` · ${t('profile.passkey_last_used', { date: formatPasskeyDate(pk.last_used_at) })}`}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeletePasskey(pk.id)}
                            className="shrink-0 text-sm text-destructive transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transition-none"
                          >
                            {t('profile.delete')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-2">
                    <label htmlFor="passkey-device-name" className="text-sm text-muted-foreground">
                      {t('profile.passkey_name_label')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="passkey-device-name"
                        type="text"
                        value={passkeyDeviceName}
                        onChange={e => setPasskeyDeviceName(e.target.value)}
                        placeholder={t('profile.passkey_name_placeholder')}
                        className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <Button
                        onClick={handleAddPasskey}
                        disabled={passkeyAdding || !passkeyDeviceName.trim()}
                        className="h-9 px-4 text-sm"
                      >
                        {passkeyAdding ? t('profile.adding_passkey') : t('profile.add_passkey')}
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
                <span id="piano-heading">{t('profile.plan_section')}</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
              {tier !== 'unlimited' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">{t('profile.cloud_usage')}</span>
                    <span className="text-sm tabular-nums text-foreground">
                      {formatMinutes(quotaUsed)} / {formatMinutes(quotaCap)}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={percentUsed}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('dashboard.quota_aria', { percent: percentUsed, remaining: formatMinutes(quotaCap - quotaUsed), cap: formatMinutes(quotaCap) })}
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
                  {t('profile.unlimited_usage')}
                </p>
              )}
              <div className="pt-1">
                {tier === 'free' ? (
                  <Button
                    onClick={() => navigate('/pricing')}
                    className="h-9 px-5 text-sm"
                  >
                    {t('profile.upgrade_plan')}
                  </Button>
                ) : (
                  <button
                    onClick={handlePortal}
                    disabled={portalLoading}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50 motion-reduce:transition-none"
                  >
                    {portalLoading ? t('profile.opening') : t('profile.manage_subscription')}
                  </button>
                )}
              </div>
            </div>
          </motion.section>

          {/* ── Preferenze ──────────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }} aria-labelledby="prefs-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="prefs-heading">{t('profile.app_settings')}</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="language-select" className="text-sm text-muted-foreground">
                  {t('profile.language_label')}
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
                  {t('profile.synthesis_mode_label')}
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
                {defaultMode === 'local' && (
                  <button
                    type="button"
                    onClick={() => setShowOllamaModal(true)}
                    className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {t('profile.privacy_engine')}
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profession-search" className="text-sm text-muted-foreground">
                  {t('profile.profession_label')}
                </label>
                <div className="relative">
                  <input
                    id="profession-search"
                    type="text"
                    value={professionOpen ? professionSearch : getProfessionLabel(profession, t)}
                    onFocus={() => { setProfessionOpen(true); setProfessionSearch('') }}
                    onBlur={() => setTimeout(() => setProfessionOpen(false), 150)}
                    onChange={e => setProfessionSearch(e.target.value)}
                    placeholder={t('profile.profession_placeholder')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                            key={item.slug}
                            type="button"
                            onClick={() => { setProfession(item.slug); setProfessionSearch('') }}
                            aria-pressed={profession === item.slug}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors motion-reduce:transition-none ${
                              profession === item.slug
                                ? 'bg-secondary text-primary'
                                : 'text-foreground hover:bg-border'
                            }`}
                          >
                            {item.label}
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
                  variant="outline"
                  className="h-9 px-5 text-sm"
                >
                  {saving ? t('profile.saving_prefs') : t('profile.save_preferences')}
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
                      {t('profile.saved')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <div className="border-t border-border pt-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t('profile.whisper_model_hint')}
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="whisper-model-select" className="text-sm text-muted-foreground">
                    {t('profile.whisper_model_label')}
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
                      {t('profile.whisper_auto', { model: detectedModel === WHISPER_LARGE ? t('profile.whisper_large') : t('profile.whisper_small') })}
                    </option>
                    <option value={WHISPER_LARGE}>{t('profile.whisper_large')}</option>
                    <option value={WHISPER_SMALL}>{t('profile.whisper_small')}</option>
                  </select>
                </div>
                {whisperOverride && (
                  <p className="text-xs text-muted-foreground">
                    {t('profile.whisper_override_note')}
                  </p>
                )}
              </div>
            </div>
          </motion.section>

          {/* ── Notifiche email ─────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.16 }} aria-labelledby="notifications-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="notifications-heading">{t('profile.automations_section')}</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('profile.weekly_reminder')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('profile.weekly_reminder_desc')}</p>
                </div>
                {tier === 'free' ? (
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <button
                      onClick={() => navigate('/pricing')}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Pro →
                    </button>
                  </div>
                ) : (
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
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg transform transition-transform',
                      weeklyReminder ? 'translate-x-5' : 'translate-x-0'
                    )} />
                  </button>
                )}
              </div>
              {tier === 'unlimited' && (
                <div className="border-t border-border pt-5 space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('profile.backup_encrypt_desc')}
                  </p>
                  <div className="space-y-1.5">
                    <label htmlFor="backup-freq" className="text-sm text-muted-foreground">
                      {t('profile.backup_frequency')}
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
                      <option value="1h">{t('profile.backup_hourly')}</option>
                      <option value="6h">{t('profile.backup_6h')}</option>
                      <option value="24h">{t('profile.backup_daily')}</option>
                      <option value="off">{t('profile.backup_disabled')}</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      {t('profile.last_backup', { date: formatBackupDate(lastBackupAt) })}
                    </span>
                    <Button
                      onClick={handleManualBackup}
                      disabled={backupRunning}
                      className="h-9 px-4 text-sm"
                      variant="outline"
                    >
                      {backupRunning ? t('profile.backup_running') : t('profile.backup_now')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.section>

          {/* ── Privacy & Dati ──────────────────────────── */}
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.18 }} aria-labelledby="privacy-heading">
            <div className="mb-4">
              <SectionHeading>
                <span id="privacy-heading">{t('profile.privacy_section')}</span>
              </SectionHeading>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-4">
              <div className="pb-4 border-b border-border">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('profile.sync_mode')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {t('profile.sync_desc')}
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={syncEnabled}
                    onClick={() => {
                      if (syncEnabled) {
                        setShowSyncDisableConfirm(true)
                      } else {
                        navigate('/onboarding', { state: { startAtStep: 5, syncOnly: true } })
                      }
                    }}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      syncEnabled ? 'bg-primary' : 'bg-muted'
                    )}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg transform transition-transform',
                      syncEnabled ? 'translate-x-5' : 'translate-x-0'
                    )} />
                  </button>
                </div>
                {syncEnabled && (
                  <p className="mt-2 text-xs text-primary">
                    {t('profile.sync_active')}
                  </p>
                )}
                <AnimatePresence>
                  {showSyncDisableConfirm && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="mt-3 rounded-lg border border-border bg-muted/50 px-4 py-3"
                    >
                      <p className="mb-1 text-sm font-medium text-foreground">
                        {t('profile.sync_disable_confirm')}
                      </p>
                      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                        {t('profile.sync_disable_warning')}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={async () => {
                            await updatePreferences({ sync_enabled: 0 })
                            localStorage.removeItem('sonabrief_sync_enabled')
                            setSyncEnabled(false)
                            setShowSyncDisableConfirm(false)
                          }}
                          className="text-xs font-medium text-destructive hover:underline"
                        >
                          {t('profile.sync_disable_confirm_btn')}
                        </button>
                        <button
                          onClick={() => setShowSyncDisableConfirm(false)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {t('profile.cancel')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('profile.privacy_note')}
              </p>
              <a
                href="/docs/whitepaper-privacy.md"
                download="Sonabrief-Whitepaper-Privacy.md"
                className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
              >
                {t('profile.privacy_whitepaper')}
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
                        {t('profile.delete_account')}
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
                        {t('profile.delete_account_warning')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('profile.delete_account_confirm_msg')}
                      </p>
                      <input
                        type="text"
                        value={deleteInput}
                        onChange={e => setDeleteInput(e.target.value)}
                        placeholder={t('profile.delete_account_placeholder')}
                        autoComplete="off"
                        className="w-full rounded-md border border-destructive bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                        aria-label={t('profile.delete_account_aria')}
                      />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleteInput.toLowerCase() !== t('profile.delete_confirm_word') || deleting}
                          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-40 motion-reduce:transition-none"
                        >
                          {deleting ? t('profile.deleting') : t('profile.delete_account_btn')}
                        </button>
                        <button
                          onClick={() => { setDeleteConfirm(false); setDeleteInput('') }}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                        >
                          {t('profile.cancel')}
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

      {showOllamaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-background shadow-xl">
            <OllamaSetupFlow
              onComplete={async () => {
                setShowOllamaModal(false)
                await updatePreferences({ synthesis_mode: 'local' })
                setDefaultMode('local')
                toast(t('profile.privacy_engine_active'))
              }}
              onCancel={() => setShowOllamaModal(false)}
              onBack={() => {
                setShowOllamaModal(false)
                setDefaultMode('standard')
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}