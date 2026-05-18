import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { savePreferences } from '../lib/api'

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

const TOTAL_STEPS = 5

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all ${
            i < step ? 'bg-[#1A4D52]' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

function StepTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2
        className="text-2xl text-[#1A4D52]"
        style={{ fontFamily: '"Instrument Serif", serif' }}
      >
        {title}
      </h2>
      {sub && <p className="mt-1 text-sm text-gray-500">{sub}</p>}
    </div>
  )
}

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

  // Step 5 — modalità + sync
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
    if (step === 3) return true // opzionale
    if (step === 4) return !!meetingDuration && !!clientVolume
    if (step === 5) return true
    return false
  }

  return (
    <div className="min-h-screen bg-[#FAF7F0] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <ProgressBar step={step} />

        {/* Step 1 — Lingua */}
        {step === 1 && (
          <div>
            <StepTitle
              title="Benvenuto su Sonabrief."
              sub="Scegli la lingua in cui vuoi lavorare. Potrai cambiarla in qualsiasi momento."
            />
            <div className="flex flex-col gap-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`w-full text-left rounded-xl border px-5 py-3 text-sm transition-colors ${
                    language === lang.code
                      ? 'border-[#1A4D52] bg-teal-50 text-[#1A4D52]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {lang.label}
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
              placeholder="Cerca la tua professione..."
              value={professionSearch}
              onChange={e => setProfessionSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600 mb-4"
            />
            <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-1">
              {filteredProfessions.map(cat => (
                <div key={cat.category}>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                    {cat.category}
                  </p>
                  <div className="flex flex-col gap-1">
                    {cat.items.map(item => (
                      <button
                        key={item}
                        onClick={() => {
                          setProfession(item)
                          setProfessionCategory(cat.category)
                        }}
                        className={`w-full text-left rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                          profession === item
                            ? 'border-[#1A4D52] bg-teal-50 text-[#1A4D52]'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {item}
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
              title="Aggiungi contesto (opzionale)"
              sub="Una frase sul tuo lavoro rende le sintesi ancora più precise. Puoi saltare questo step."
            />
            <textarea
              placeholder="Es. &quot;Seguo clienti PMI nel settore manifatturiero&quot; oppure &quot;Conduco interviste qualitative per ricerca accademica&quot;"
              value={contextNote}
              onChange={e => setContextNote(e.target.value.slice(0, 200))}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{contextNote.length}/200</p>
          </div>
        )}

        {/* Step 4 — Meeting & Clienti */}
        {step === 4 && (
          <div>
            <StepTitle
              title="Come lavori?"
              sub="Due domande veloci per ottimizzare la tua esperienza."
            />
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Durata tipica dei tuoi meeting
            </p>
            <div className="flex flex-col gap-2 mb-6">
              {MEETING_DURATIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setMeetingDuration(d.value)}
                  className={`w-full text-left rounded-xl border px-5 py-3 transition-colors ${
                    meetingDuration === d.value
                      ? 'border-[#1A4D52] bg-teal-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm ${meetingDuration === d.value ? 'text-[#1A4D52]' : 'text-gray-700'}`}>
                    {d.label}
                  </p>
                  <p className="text-xs text-gray-400">{d.sub}</p>
                </button>
              ))}
            </div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Clienti / progetti gestiti in parallelo
            </p>
            <div className="flex flex-col gap-2">
              {CLIENT_VOLUMES.map(v => (
                <button
                  key={v.value}
                  onClick={() => setClientVolume(v.value)}
                  className={`w-full text-left rounded-xl border px-5 py-3 text-sm transition-colors ${
                    clientVolume === v.value
                      ? 'border-[#1A4D52] bg-teal-50 text-[#1A4D52]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5 — Modalità + Sync */}
        {step === 5 && (
          <div>
            <StepTitle
              title="Come vuoi usare Sonabrief?"
              sub="Puoi cambiare queste impostazioni per ogni meeting."
            />
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Modalità di sintesi predefinita
            </p>
            <div className="flex flex-col gap-2 mb-6">
              <button
                onClick={() => setSynthesisMode('standard')}
                className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
                  synthesisMode === 'standard'
                    ? 'border-[#1A4D52] bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-medium ${synthesisMode === 'standard' ? 'text-[#1A4D52]' : 'text-gray-700'}`}>
                  Standard
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Trascrizione locale + sintesi cloud EU. Qualità migliore, audio mai caricato.
                </p>
              </button>
              <button
                onClick={() => setSynthesisMode('local')}
                className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
                  synthesisMode === 'local'
                    ? 'border-[#1A4D52] bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-medium ${synthesisMode === 'local' ? 'text-[#1A4D52]' : 'text-gray-700'}`}>
                  Local Only
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tutto sul tuo computer. Zero dati escono. Richiede Ollama installato.
                </p>
              </button>
            </div>

            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Sincronizzazione note
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setSyncEnabled(false)}
                className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
                  !syncEnabled
                    ? 'border-[#1A4D52] bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-medium ${!syncEnabled ? 'text-[#1A4D52]' : 'text-gray-700'}`}>
                  Solo locale
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Le note restano su questo dispositivo.
                </p>
              </button>
              <button
                onClick={() => setSyncEnabled(true)}
                className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
                  syncEnabled
                    ? 'border-[#1A4D52] bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-medium ${syncEnabled ? 'text-[#1A4D52]' : 'text-gray-700'}`}>
                  Sync cifrato
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Note sincronizzate tra dispositivi con crittografia zero-knowledge. Configuri la passphrase nel prossimo step.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Navigazione */}
        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ← Indietro
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="rounded-lg bg-[#1A4D52] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#143a3e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 3 ? (contextNote.trim() ? 'Continua' : 'Salta') : 'Continua'}
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="rounded-lg bg-[#1A4D52] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#143a3e] transition-colors disabled:opacity-40"
            >
              {saving ? 'Salvataggio...' : 'Inizia a usare Sonabrief →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
