import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { savePreferences, updateDisplayName } from '../lib/api'

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

const LANGUAGES = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
]

const MEETING_DURATIONS = [
  { value: 'short', label: 'Meno di 30 minuti', sub: 'Call rapide, standup' },
  { value: 'medium', label: '30–60 minuti', sub: 'Meeting standard' },
  { value: 'long', label: '1–2 ore', sub: 'Workshop, consulenze' },
  { value: 'very_long', label: 'Più di 2 ore', sub: 'Sessioni intensive' },
]

const CLIENT_VOLUMES = [
  { value: 'few', label: '1–5 clienti / progetti' },
  { value: 'medium', label: '5–15 clienti / progetti' },
  { value: 'many', label: 'Più di 15 clienti / progetti' },
]

const TOTAL_STEPS = 6

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <span className="sr-only">Passo {step} di {TOTAL_STEPS}</span>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
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
    active
      ? 'border-primary bg-secondary'
      : 'border-border bg-card hover:bg-border'
  }`

const optionCardWide = (active: boolean) =>
  `w-full text-left rounded-lg border px-5 py-4 transition-colors motion-reduce:transition-none ${
    active
      ? 'border-primary bg-secondary'
      : 'border-border bg-card hover:bg-border'
  }`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1 — lingua
  const [language, setLanguage] = useState('it')

  // Step 2 — professione
  const [profession, setProfession] = useState('')
  const [professionCategory, setProfessionCategory] = useState('')
  const [professionSearch, setProfessionSearch] = useState('')

  // Step 3 — contesto opzionale
  const [contextNote, setContextNote] = useState('')

  // Step 4 — meeting + clienti
  const [meetingDuration, setMeetingDuration] = useState('')
  const [clientVolume, setClientVolume] = useState('')

  // Step 5 — nome
  const [displayName, setDisplayName] = useState('')

  // Step 6 — modalità + sync
  const [synthesisMode, setSynthesisMode] = useState('standard')
  const [syncEnabled, setSyncEnabled] = useState(false)

  const filteredProfessions = professionSearch.trim()
    ? PROFESSIONS.map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          item.toLowerCase().includes(professionSearch.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : PROFESSIONS

  async function handleFinish() {
    setSaving(true)
    await savePreferences({
      language,
      profession: profession || null,
      profession_category: professionCategory || null,
      context_note: contextNote.trim() || null,
      meeting_duration: meetingDuration || null,
      client_volume: clientVolume || null,
      synthesis_mode: synthesisMode,
      sync_enabled: syncEnabled ? 1 : 0,
      onboarded: 1,
      display_name: displayName.trim() || null,
    })
    setSaving(false)
    if (syncEnabled) {
      navigate('/sync/setup')
    } else {
      navigate('/dashboard')
    }
  }

  function canProceed(): boolean {
    if (step === 1) return !!language
    if (step === 2) return !!profession
    if (step === 3) return true
    if (step === 4) return !!meetingDuration && !!clientVolume
    if (step === 5) return true
    if (step === 6) return true
    return false
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <img src="/logo.svg" alt="Sonabrief" className="mb-10 h-7 w-auto" />

        <ProgressBar step={step} />

        {/* Step 1 — Lingua */}
        {step === 1 && (
          <div>
            <StepTitle
              display
              title="Benvenuto su Sonabrief."
              sub="Scegli la lingua in cui vuoi lavorare. Potrai cambiarla in qualsiasi momento."
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
              title="Cosa fai di mestiere?"
              sub="Le sintesi si adatteranno al tuo settore e al tuo linguaggio professionale."
            />
            <input
              type="text"
              aria-label="Cerca la tua professione"
              placeholder="Cerca la tua professione..."
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

        {/* Step 3 — Contesto opzionale */}
        {step === 3 && (
          <div>
            <StepTitle
              title="Aggiungi contesto"
              sub="Una frase sul tuo lavoro rende le sintesi ancora più precise. Puoi saltare questo step."
            />
            <textarea
              aria-label="Contesto professionale"
              placeholder='Es. "Seguo clienti PMI nel settore manifatturiero" oppure "Conduco interviste qualitative per ricerca accademica"'
              value={contextNote}
              onChange={e => setContextNote(e.target.value.slice(0, 200))}
              rows={4}
              className="w-full rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none motion-reduce:transition-none"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {contextNote.length}/200
            </p>
          </div>
        )}

        {/* Step 4 — Meeting & Clienti */}
        {step === 4 && (
          <div>
            <StepTitle
              title="Come lavori?"
              sub="Due impostazioni per ottimizzare la tua esperienza."
            />
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Durata tipica dei tuoi meeting
            </p>
            <div className="mb-6 flex flex-col gap-2">
              {MEETING_DURATIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setMeetingDuration(d.value)}
                  aria-pressed={meetingDuration === d.value}
                  className={optionCardWide(meetingDuration === d.value)}
                >
                  <p className={`text-sm font-medium ${meetingDuration === d.value ? 'text-primary' : 'text-foreground'}`}>
                    {d.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{d.sub}</p>
                </button>
              ))}
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Clienti / progetti gestiti in parallelo
            </p>
            <div className="flex flex-col gap-2">
              {CLIENT_VOLUMES.map(v => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setClientVolume(v.value)}
                  aria-pressed={clientVolume === v.value}
                  className={optionCard(clientVolume === v.value)}
                >
                  <span className={`text-sm ${clientVolume === v.value ? 'text-primary' : 'text-foreground'}`}>
                    {v.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5 — Nome */}
        {step === 5 && (
          <div>
            <StepTitle
              title="Come ti chiami?"
              sub="Il tuo nome verrà usato per personalizzare l'esperienza. Puoi saltare questo step."
            />
            <input
              type="text"
              aria-label="Il tuo nome"
              placeholder="Es. Sofia"
              value={displayName}
              onChange={e => setDisplayName(e.target.value.slice(0, 50))}
              className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              autoFocus
            />
          </div>
        )}

        {/* Step 6 — Modalità + Sync */}
        {step === 6 && (
          <div>
            <StepTitle
              title="Come vuoi usare Sonabrief?"
              sub="Puoi cambiare queste impostazioni per ogni meeting."
            />
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Modalità di sintesi predefinita
            </p>
            <div className="mb-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setSynthesisMode('standard')}
                aria-pressed={synthesisMode === 'standard'}
                className={optionCardWide(synthesisMode === 'standard')}
              >
                <p className={`text-sm font-medium ${synthesisMode === 'standard' ? 'text-primary' : 'text-foreground'}`}>
                  Standard
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trascrizione locale + sintesi cloud EU. Qualità migliore, audio mai caricato.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSynthesisMode('local')}
                aria-pressed={synthesisMode === 'local'}
                className={optionCardWide(synthesisMode === 'local')}
              >
                <p className={`text-sm font-medium ${synthesisMode === 'local' ? 'text-primary' : 'text-foreground'}`}>
                  Local Only
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tutto sul tuo computer. Zero dati escono. Richiede Ollama installato.
                </p>
              </button>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Sincronizzazione note
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setSyncEnabled(false)}
                aria-pressed={!syncEnabled}
                className={optionCardWide(!syncEnabled)}
              >
                <p className={`text-sm font-medium ${!syncEnabled ? 'text-primary' : 'text-foreground'}`}>
                  Solo locale
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Le note restano su questo dispositivo.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSyncEnabled(true)}
                aria-pressed={syncEnabled}
                className={optionCardWide(syncEnabled)}
              >
                <p className={`text-sm font-medium ${syncEnabled ? 'text-primary' : 'text-foreground'}`}>
                  Sync cifrato
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Note sincronizzate tra dispositivi con crittografia zero-knowledge. Configuri la passphrase nel prossimo step.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              aria-label="Torna al passo precedente"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
            >
              ← Indietro
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            >
              {step === 3 && !contextNote.trim() ? 'Salta' : step === 5 && !displayName.trim() ? 'Salta' : 'Continua'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={saving}
              className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40 motion-reduce:transition-none"
            >
              {saving ? 'Salvataggio...' : 'Apri la dashboard'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
