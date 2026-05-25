import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { API_URL } from '../config'
import { AppNav } from '../components/AppNav'
import { getBillingStatus } from '../lib/api'

interface Template {
  id: string
  name: string
  description?: string
  language: string
  system_prompt: string
  is_system: number
  parent_id?: string
}

const LANG_LABEL: Record<string, string> = {
  it: 'Italiano', en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch',
}

const LANG_OPTIONS = ['it', 'en', 'fr', 'es', 'de'] as const

const GENERIC_ID = 'sys_generic_it_v2'

const EMPTY_PROMPT = `Sei un assistente esperto nella redazione di verbali professionali.
Analizza la trascrizione e produci un resoconto strutturato con le seguenti sezioni.

**Sezione 1**
Descrivi qui cosa deve contenere questa sezione.

**Sezione 2**
Descrivi qui cosa deve contenere questa sezione.

Regole:
- Non inventare mai contenuto non presente nella trascrizione
- Se una sezione non ha contenuto reale, omettila completamente
- Niente frasi di chiusura o saluti`

const inputClass =
  'w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none'

function extractSections(prompt: string): string[] {
  const matches = prompt.match(/\*\*([^*]+)\*\*/g) ?? []
  return matches.map(m => m.replace(/\*\*/g, '').trim()).filter(Boolean)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Template> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isFree, setIsFree] = useState(false)
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null)

  useEffect(() => {
    getBillingStatus().then(status => {
      setIsFree(!status || status.tier === 'free')
    })
  }, [])

  async function load() {
    const r = await fetch(`${API_URL}/v1/templates`, { credentials: 'include' })
    if (r.ok) setTemplates(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const genericTemplate = templates.find(t => t.id === GENERIC_ID)
  const customTemplates = templates.filter(t => !t.is_system)

  function startFromScratch() {
    setError(null)
    setEditing({ name: '', description: '', language: 'it', system_prompt: EMPTY_PROMPT })
  }

  function startFromGeneric() {
    setError(null)
    setEditing({
      name: '',
      description: '',
      language: genericTemplate?.language ?? 'it',
      system_prompt: genericTemplate?.system_prompt ?? EMPTY_PROMPT,
    })
  }

  function startEdit(t: Template) {
    setError(null)
    setEditing({ ...t })
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    setError(null)
    const isNew = !editing.id
    const url = isNew
      ? `${API_URL}/v1/templates`
      : `${API_URL}/v1/templates/${editing.id}`
    const r = await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editing.name,
        description: editing.description,
        language: editing.language,
        system_prompt: editing.system_prompt,
        parent_id: (editing as any).parent_id,
      }),
    })
    setSaving(false)
    if (r.status === 403) {
      const body = await r.json() as { error: string; limit?: number }
      if (body.error === 'custom_templates_not_allowed')
        setError('I template personalizzati richiedono il piano Pro.')
      else if (body.error === 'template_limit_reached')
        setError(`Hai raggiunto il limite di ${body.limit} template per il tuo piano.`)
      else setError('Errore durante il salvataggio.')
      return
    }
    if (!r.ok) { setError('Errore durante il salvataggio.'); return }
    setEditing(null)
    load()
  }

  async function deleteTemplate(id: string) {
    await fetch(`${API_URL}/v1/templates/${id}`, { method: 'DELETE', credentials: 'include' })
    setDeleteConfirm(null)
    load()
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 font-heading text-2xl font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          I tuoi template
        </h1>

        {loading && (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        )}

        <div className="flex flex-col gap-5">

          {/* ── Create card ──────────────────────────── */}
          {!editing && (
            <div className="rounded-lg border border-border p-5">
              <p className="text-sm font-semibold text-foreground">Crea un nuovo template</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Definisci come Sonabrief struttura le sintesi per un tipo specifico di meeting: un formato legale, un briefing commerciale, un'intervista qualitativa.
              </p>
              {isFree ? (
                <div className="mt-4 space-y-4">
                  {/* Ghost card — form bloccato */}
                  <div className="relative rounded-lg border border-dashed border-border bg-muted/20 px-5 py-4 select-none pointer-events-none opacity-50">
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1 rounded-md border border-border bg-card px-3 py-1.5">
                        <p className="text-xs text-muted-foreground">Nome template</p>
                      </div>
                      <div className="w-28 rounded-md border border-border bg-card px-3 py-1.5">
                        <p className="text-xs text-muted-foreground">Lingua</p>
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-card px-3 py-2 mb-3">
                      <p className="text-xs text-muted-foreground">Prompt di sintesi...</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {['Sezione 1', 'Sezione 2', 'Sezione 3'].map(s => (
                        <span key={s} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Crea template su misura</p>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          Oltre ai 7 template inclusi nel piano, con Pro puoi crearne di nuovi
                          e adattare struttura e sezioni esattamente alle tue esigenze.
                        </p>
                      </div>
                      <a
                        href="/pricing"
                        className="shrink-0 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        Passa a Pro →
                      </a>
                    </div>
                  </div>

                  {/* Template di sistema — compatti */}
                  {templates.filter(t => t.is_system && t.language === 'it').length > 0 && (
                    <div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        Template inclusi nel tuo piano
                      </p>
                      <ul className="flex flex-col gap-1.5" role="list">
                        {templates.filter(t => t.is_system && t.language === 'it').map(t => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5"
                          >
                            <p className="text-sm text-foreground">{t.name}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={startFromGeneric}
                    disabled={!genericTemplate}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 motion-reduce:transition-none"
                  >
                    Usa struttura base
                  </button>
                  <button
                    onClick={startFromScratch}
                    className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                  >
                    Personalizza da zero
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Saved templates ──────────────────────── */}
          {customTemplates.length > 0 && !editing && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-muted-foreground">
                Salvati ({customTemplates.length})
              </p>
              <ul className="flex flex-col gap-2" role="list">
                {customTemplates.map((t, i) => (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.16, delay: i * 0.05 }}
                  >
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {LANG_LABEL[t.language] ?? t.language}
                        </p>
                        {t.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                        )}
                        {(() => {
                          const sections = extractSections(t.system_prompt)
                          if (sections.length === 0) return null
                          return (
                            <div className="mt-2">
                              <button
                                onClick={() => setExpandedPreview(id => id === t.id ? null : t.id)}
                                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                              >
                                <ChevronDown className={`h-3 w-3 transition-transform duration-200 motion-reduce:transition-none ${expandedPreview === t.id ? 'rotate-180' : ''}`} />
                                {expandedPreview === t.id ? 'Nascondi struttura' : 'Mostra struttura'}
                              </button>
                              <AnimatePresence>
                                {expandedPreview === t.id && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {sections.map(s => (
                                        <span key={s} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-primary">
                                          {s}
                                        </span>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => startEdit(t)}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                        >
                          Modifica
                        </button>
                        {deleteConfirm === t.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => deleteTemplate(t.id)}
                              className="rounded-md border border-destructive/30 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 motion-reduce:transition-none"
                            >
                              Conferma
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(t.id)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive motion-reduce:transition-none"
                          >
                            Elimina
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Editor ───────────────────────────────── */}
          <AnimatePresence mode="wait">
          {editing && (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="rounded-lg border border-primary/30 bg-card p-5"
            >
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                {editing.id ? 'Modifica template' : 'Nuovo template'}
              </h2>

              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="template-name" className="text-xs font-medium text-muted-foreground">
                      Nome
                    </label>
                    <input
                      id="template-name"
                      type="text"
                      value={editing.name ?? ''}
                      placeholder="Es. Consulenza legale"
                      onChange={e => setEditing(prev => ({ ...prev!, name: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex w-36 flex-col gap-1">
                    <label htmlFor="template-language" className="text-xs font-medium text-muted-foreground">
                      Lingua
                    </label>
                    <select
                      id="template-language"
                      value={editing.language ?? 'it'}
                      onChange={e => setEditing(prev => ({ ...prev!, language: e.target.value }))}
                      className={inputClass}
                    >
                      {LANG_OPTIONS.map(l => (
                        <option key={l} value={l}>{LANG_LABEL[l]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="template-description" className="text-xs font-medium text-muted-foreground">
                    Descrizione (opzionale)
                  </label>
                  <input
                    id="template-description"
                    type="text"
                    value={editing.description ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev!, description: e.target.value }))}
                    placeholder="Es. Per consulenze legali in italiano"
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="template-prompt" className="text-xs font-medium text-muted-foreground">
                    Prompt di sintesi
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Scrivi le istruzioni che l'AI seguirà per strutturare la sintesi. Usa{' '}
                    <code className="rounded bg-muted px-1 font-mono text-foreground">
                      **Titolo sezione**
                    </code>{' '}
                    per definire le sezioni.
                  </p>
                  <textarea
                    id="template-prompt"
                    value={editing.system_prompt ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev!, system_prompt: e.target.value }))}
                    rows={14}
                    className={`${inputClass} resize-y`}
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setEditing(null); setError(null) }}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || !editing.name?.trim()}
                    aria-busy={saving}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
                  >
                    {saving ? 'Salvataggio...' : 'Salva template'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

        </div>
      </main>
    </div>
  )
}
