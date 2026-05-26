import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready
const sodium = _sodium

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { savePreferences } from '../lib/api'
import { unlockWithPassphrase, persistKeyToSession, saveVerificationBlob, getCurrentKey } from '../lib/keystore'
import { initCrypto, generateSalt, generateRecoveryPhrase } from '../lib/crypto'
import { OllamaSetupFlow } from '../components/local-mode'

const LANGUAGES = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
]

// Step 1-4 sempre presenti, 5-8 solo se syncEnabled
const BASE_STEPS = 4
const SYNC_STEPS = 4

function ProgressBar({ step, totalSteps }: { step: number; totalSteps: number }) {
  const { t } = useTranslation()
  return (
    <div className="mb-8">
      <span className="sr-only">{t('onboarding.step_progress', { step, total: totalSteps })}</span>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors motion-reduce:transition-none ${
              i < step ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function StepTitle({ title, sub, display }: { title: string; sub?: string; display?: boolean }) {
  return (
    <div className="mb-6">
      <h2
        className={
          display
            ? 'font-heading font-extrabold text-[clamp(1.875rem,4vw,3rem)] leading-[1.1] tracking-[-0.02em] text-foreground'
            : 'font-heading font-bold text-2xl leading-[1.2] tracking-[-0.015em] text-foreground'
        }
      >
        {title}
      </h2>
      {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
    </div>
  )
}

const optionCard = (active: boolean) =>
  `w-full text-left rounded-lg border px-5 py-3 transition-colors motion-reduce:transition-none ${
    active ? 'border-primary bg-secondary' : 'border-border bg-card hover:bg-border'
  }`

const optionCardWide = (active: boolean) =>
  `w-full text-left rounded-lg border px-5 py-4 transition-colors motion-reduce:transition-none ${
    active ? 'border-primary bg-secondary' : 'border-border bg-card hover:bg-border'
  }`

export default function OnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // Step 1 — lingua
  const [language, setLanguage] = useState('it')

  // Step 2 — professione
  const [profession, setProfession] = useState('')
  const [professionCategory, setProfessionCategory] = useState('')
  const [professionSearch, setProfessionSearch] = useState('')

  // Step 3 — nome + contesto
  const [displayName, setDisplayName] = useState('')
  const [contextNote, setContextNote] = useState('')

  // Step 4 — modalità + sync
  const [synthesisMode, setSynthesisMode] = useState('standard')
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [showOllamaModal, setShowOllamaModal] = useState(false)

  // Step 5 — intro sync (solo testo, nessuno stato)

  // Step 6 — passphrase
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [passphraseTouched, setPassphraseTouched] = useState({ passphrase: false, confirm: false })
  const [passphraseSubmitting, setPassphraseSubmitting] = useState(false)

  // Step 7 — recovery phrase
  const [phrase, setPhrase] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // Step 8 — verifica parole
  const [checkIndices, setCheckIndices] = useState<[number, number, number]>([3, 6, 10])
  const [checkInputs, setCheckInputs] = useState<[string, string, string]>(['', '', ''])
  const [step8Attempted, setStep8Attempted] = useState(false)

  const totalSteps = syncEnabled ? BASE_STEPS + SYNC_STEPS : BASE_STEPS

  useEffect(() => {
    setPhrase(generateRecoveryPhrase())
    if (location.state?.startAtStep) {
      setStep(location.state.startAtStep)
    }
    if (location.state?.syncOnly) {
      setSyncEnabled(true)
    }
  }, [])

  useEffect(() => {
    if (step !== 8) return
    const pool = Array.from({ length: 12 }, (_, i) => i)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const sorted = pool.slice(0, 3).sort((a, b) => a - b) as [number, number, number]
    setCheckIndices(sorted)
    setCheckInputs(['', '', ''])
  }, [step])

  const PROFESSIONS = t('onboarding.professions', { returnObjects: true }) as { category: string; items: string[] }[]

  const filteredProfessions = professionSearch.trim()
    ? PROFESSIONS.map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          item.toLowerCase().includes(professionSearch.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : PROFESSIONS

  const passphraseErrMsg =
    passphraseTouched.passphrase && passphrase.length < 12 ? t('onboarding.passphrase_error_min') : ''
  const confirmErrMsg =
    passphraseTouched.confirm && passphrase !== passphraseConfirm ? t('onboarding.passphrase_error_mismatch') : ''
  const step6Valid = passphrase.length >= 12 && passphrase === passphraseConfirm

  const step8Valid = checkIndices.every(
    (idx, i) => checkInputs[i].trim().toLowerCase() === phrase[idx]?.toLowerCase()
  )

  async function handleStep6() {
    setPassphraseTouched({ passphrase: true, confirm: true })
    if (!step6Valid) return
    setPassphraseSubmitting(true)
    try {
      await initCrypto()
      const salt = generateSalt()
      await unlockWithPassphrase(passphrase, salt)
      await saveVerificationBlob(getCurrentKey()!)
      localStorage.setItem('sonabrief_sync_salt', sodium.to_base64(salt))
      setStep(7)
    } finally {
      setPassphraseSubmitting(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(phrase.join(' '))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleActivate() {
    await persistKeyToSession()
    localStorage.setItem('sonabrief_sync_enabled', 'true')
    await handleSaveAndFinish()
  }

  async function handleSaveAndFinish() {
    setSaving(true)
    await savePreferences({
      language,
      profession: profession || null,
      profession_category: professionCategory || null,
      context_note: contextNote.trim() || null,
      meeting_duration: null,
      client_volume: null,
      synthesis_mode: synthesisMode,
      sync_enabled: syncEnabled ? 1 : 0,
      onboarded: 1,
      display_name: displayName.trim() || null,
    })
    setSaving(false)
    setDone(true)
  }

  function canProceed(): boolean {
    if (step === 1) return !!language
    if (step === 2) return !!profession
    if (step === 3) return true
    if (step === 4) return true
    if (step === 5) return true
    if (step === 6) return step6Valid
    if (step === 7) return true
    if (step === 8) return true
    return false
  }

  function handleNext() {
    // Step 4: se non sync, salva e vai alla schermata finale
    if (step === 4 && !syncEnabled) {
      handleSaveAndFinish()
      return
    }
    setStep(s => s + 1)
  }

  // ── Schermata finale ──────────────────────────────────────────────────────
  if (done) {
    const name = displayName.trim()
    return (
      <AnimatePresence>
        <motion.div
          key="done-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="min-h-screen bg-background flex items-center justify-center px-6 py-12"
        >
          <div className="w-full max-w-lg text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="mb-10 flex justify-center"
            >
              <img src="/logo.svg" alt="Sonabrief" className="h-12 w-auto" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="font-heading font-extrabold text-[clamp(1.875rem,4vw,2.5rem)] leading-[1.1] tracking-[-0.02em] text-foreground"
            >
              {name ? t('onboarding.done_title_name', { name }) : t('onboarding.done_title')}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.35 }}
              className="mt-3 text-sm text-muted-foreground"
            >
              {t('onboarding.done_hint')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.35 }}
              className="mt-8"
            >
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="rounded-md bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                {t('onboarding.open_dashboard')}
              </button>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <img src="/logo.svg" alt="Sonabrief" className="mb-10 h-7 w-auto" />

        <ProgressBar step={step} totalSteps={totalSteps} />

        {/* Step 1 — Lingua */}
        {step === 1 && (
          <div>
            <StepTitle
              display
              title={t('onboarding.welcome')}
              sub={t('onboarding.welcome_hint')}
            />
            <div className="flex flex-col gap-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  aria-pressed={language === lang.code}
                  className={optionCard(language === lang.code)}
                >
                  <span className={`text-sm ${language === lang.code ? 'text-primary' : 'text-foreground'}`}>
                    {lang.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Professione */}
        {step === 2 && (
          <div>
            <StepTitle
              title={t('onboarding.profession_title')}
              sub={t('onboarding.profession_hint')}
            />
            <input
              type="text"
              aria-label={t('onboarding.profession_search_aria')}
              placeholder={t('onboarding.profession_search_placeholder')}
              value={professionSearch}
              onChange={e => setProfessionSearch(e.target.value)}
              className="mb-4 w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            />
            <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-1">
              {filteredProfessions.map(cat => (
                <div key={cat.category}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {cat.category}
                  </p>
                  <div className="flex flex-col gap-1">
                    {cat.items.map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setProfession(item)
                          setProfessionCategory(cat.category)
                        }}
                        aria-pressed={profession === item}
                        className={optionCard(profession === item)}
                      >
                        <span className={`text-sm ${profession === item ? 'text-primary' : 'text-foreground'}`}>
                          {item}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Nome + Contesto */}
        {step === 3 && (
          <div>
            <StepTitle
              title={t('onboarding.about_title')}
              sub={t('onboarding.about_hint')}
            />
            <div className="mb-5">
              <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('onboarding.name_label')}
              </label>
              <input
                id="displayName"
                type="text"
                placeholder={t('onboarding.name_placeholder')}
                value={displayName}
                onChange={e => setDisplayName(e.target.value.slice(0, 50))}
                className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                autoFocus
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('onboarding.name_hint')}</p>
            </div>
            <div>
              <label htmlFor="contextNote" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('onboarding.context_label')} <span className="text-muted-foreground font-normal">{t('onboarding.optional')}</span>
              </label>
              <textarea
                id="contextNote"
                placeholder={t('onboarding.context_placeholder')}
                value={contextNote}
                onChange={e => setContextNote(e.target.value.slice(0, 200))}
                rows={3}
                className="w-full rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none motion-reduce:transition-none"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{contextNote.length}/200</p>
            </div>
          </div>
        )}

        {/* Step 4 — Modalità + Sync */}
        {step === 4 && (
          <div>
            <StepTitle
              title={t('onboarding.settings_title')}
              sub={t('onboarding.settings_hint')}
            />
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t('onboarding.synthesis_mode_label')}
            </p>
            <div className="mb-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setSynthesisMode('standard')}
                aria-pressed={synthesisMode === 'standard'}
                className={optionCardWide(synthesisMode === 'standard')}
              >
                <p className={`text-sm font-medium ${synthesisMode === 'standard' ? 'text-primary' : 'text-foreground'}`}>
                  {t('onboarding.mode_standard')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('onboarding.mode_standard_desc')}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setShowOllamaModal(true)}
                aria-pressed={synthesisMode === 'local'}
                className={optionCardWide(synthesisMode === 'local')}
              >
                <p className={`text-sm font-medium ${synthesisMode === 'local' ? 'text-primary' : 'text-foreground'}`}>
                  {t('onboarding.mode_local')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('onboarding.mode_local_desc')}
                </p>
              </button>
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t('onboarding.sync_label')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setSyncEnabled(false)}
                aria-pressed={!syncEnabled}
                className={optionCardWide(!syncEnabled)}
              >
                <p className={`text-sm font-medium ${!syncEnabled ? 'text-primary' : 'text-foreground'}`}>
                  {t('onboarding.sync_local')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('onboarding.sync_local_desc')}</p>
              </button>
              <button
                type="button"
                onClick={() => setSyncEnabled(true)}
                aria-pressed={syncEnabled}
                className={optionCardWide(syncEnabled)}
              >
                <p className={`text-sm font-medium ${syncEnabled ? 'text-primary' : 'text-foreground'}`}>
                  {t('onboarding.sync_cloud')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('onboarding.sync_cloud_desc')}
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step 5 — Intro sync */}
        {step === 5 && (
          <div>
            <StepTitle
              title={t('onboarding.sync_setup_title')}
              sub={t('onboarding.sync_setup_hint')}
            />

            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
              <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
              <p className="text-sm text-amber-800 leading-relaxed">
                {t('onboarding.sync_security_note')}
              </p>
            </div>

            <ul className="space-y-4">
              {[
                { n: '1', text: t('onboarding.sync_step_1') },
                { n: '2', text: t('onboarding.sync_step_2') },
                { n: '3', text: t('onboarding.sync_step_3') },
              ].map(item => (
                <li key={item.n} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {item.n}
                  </span>
                  <span className="text-sm text-muted-foreground">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Step 6 — Passphrase */}
        {step === 6 && (
          <div>
            <StepTitle
              title={t('onboarding.passphrase_title')}
              sub={t('onboarding.passphrase_hint')}
            />
            <div className="space-y-4">
              <div>
                <label htmlFor="passphrase" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('onboarding.passphrase_label')}
                </label>
                <input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  onBlur={() => setPassphraseTouched(prev => ({ ...prev, passphrase: true }))}
                  placeholder={t('onboarding.passphrase_placeholder')}
                  className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                />
                {passphraseErrMsg && <p className="mt-1 text-xs text-destructive">{passphraseErrMsg}</p>}
              </div>
              <div>
                <label htmlFor="passphraseConfirm" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('onboarding.confirm_passphrase_label')}
                </label>
                <input
                  id="passphraseConfirm"
                  type="password"
                  value={passphraseConfirm}
                  onChange={e => setPassphraseConfirm(e.target.value)}
                  onBlur={() => setPassphraseTouched(prev => ({ ...prev, confirm: true }))}
                  placeholder={t('onboarding.confirm_passphrase_placeholder')}
                  className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                />
                {confirmErrMsg && <p className="mt-1 text-xs text-destructive">{confirmErrMsg}</p>}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
              <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
              <p className="text-sm text-amber-800 leading-relaxed">
                {t('onboarding.passphrase_save_note')}
              </p>
            </div>
          </div>
        )}

        {/* Step 7 — Recovery phrase */}
        {step === 7 && (
          <div>
            <StepTitle
              title={t('onboarding.recovery_title')}
              sub={t('onboarding.recovery_hint')}
            />

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
              <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
              <p className="text-sm text-amber-800 leading-relaxed">
                {t('onboarding.recovery_warning')}
              </p>
            </div>

            <div
              className="grid grid-cols-3 gap-2 rounded-lg border p-4 mb-4"
              style={{ backgroundColor: '#FAF7F0', borderColor: '#C8986866' }}
            >
              {phrase.map((word, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span className="font-mono text-sm text-foreground">{word}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none mb-5"
            >
              {copied ? t('onboarding.copied') : t('onboarding.copy_all')}
            </button>

          </div>
        )}

        {/* Step 8 — Verifica parole */}
        {step === 8 && (
          <div>
            <StepTitle
              title={t('onboarding.verify_title')}
              sub={t('onboarding.verify_hint')}
            />
            <div className="space-y-4">
              {checkIndices.map((idx, i) => (
                <div key={idx}>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    {t('onboarding.word_n', { n: idx + 1 })}
                  </label>
                  <input
                    type="text"
                    value={checkInputs[i]}
                    onChange={e =>
                      setCheckInputs(prev => {
                        const next: [string, string, string] = [...prev] as [string, string, string]
                        next[i] = e.target.value
                        return next
                      })
                    }
                    className={`w-full rounded-md border px-4 py-2.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors motion-reduce:transition-none ${
                      step8Attempted && checkInputs[i].trim().toLowerCase() !== phrase[idx]?.toLowerCase()
                        ? 'border-destructive bg-destructive/5'
                        : 'border-border bg-card'
                    }`}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {step8Attempted && checkInputs[i].trim().toLowerCase() !== phrase[idx]?.toLowerCase() && (
                    <p className="mt-1 text-xs text-destructive">{t('onboarding.word_error')}</p>
                  )}
                </div>
              ))}
            </div>
            {step8Attempted && !step8Valid && (
              <p className="mt-4 text-sm text-destructive text-center">
                {t('onboarding.verify_error')}
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 8) {
                  setStep8Attempted(false)
                  setCheckInputs(['', '', ''])
                }
                setStep(s => s - 1)
              }}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
            >
              {t('onboarding.back')}
            </button>
          ) : (
            <div />
          )}

          <div className="flex flex-col items-end gap-2">
            {/* Bottone principale */}
            {step === 6 ? (
              <button
                type="button"
                onClick={handleStep6}
                disabled={!step6Valid || passphraseSubmitting}
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              >
                {passphraseSubmitting ? t('onboarding.deriving_key') : t('onboarding.continue')}
              </button>
            ) : step === 8 ? (
              <button
                type="button"
                onClick={() => {
                  setStep8Attempted(true)
                  if (step8Valid) handleActivate()
                }}
                disabled={saving}
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40 motion-reduce:transition-none"
              >
                {saving ? t('onboarding.saving') : t('onboarding.activate_sync')}
              </button>
            ) : step === 4 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={saving}
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40 motion-reduce:transition-none"
              >
                {saving ? t('onboarding.saving') : syncEnabled ? t('onboarding.continue') : t('onboarding.open_dashboard')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              >
                {t('onboarding.continue')}
              </button>
            )}

            {/* Salta — solo step 3 */}
            {step === 3 && (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
              >
                {t('onboarding.skip')}
              </button>
            )}
          </div>
        </div>

      </div>

      {showOllamaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-background shadow-xl">
            <OllamaSetupFlow
              autoDetect={false}
              onComplete={() => {
                setShowOllamaModal(false)
                setSynthesisMode('local')
              }}
              onCancel={() => {
                setShowOllamaModal(false)
                setSynthesisMode('standard')
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}