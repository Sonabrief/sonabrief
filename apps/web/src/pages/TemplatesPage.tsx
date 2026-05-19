import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'

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

export default function TemplatesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Template> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

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
    setEditing({
      name: '',
      description: '',
      language: 'it',
      system_prompt: EMPTY_PROMPT,
    })
  }

  function startFromGeneric() {
    setError(null)
    setEditing({
      name: '',
      description: '',
      language: genericTemplate?.language ?? 'it',
      system_prompt: genericTemplate?.system_prompt ?? EMPTY_PROMPT,
      parent_id: GENERIC_ID,
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
    <div className="flex min-h-screen flex-col items-center gap-8 p-8">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <h1 className="text-2xl font-semibold">I tuoi template</h1>
        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 underline">
          Dashboard
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Caricamento...</p>}

      {/* Crea nuovo */}
      {!editing && (
        <div className="w-full max-w-2xl rounded-xl border border-dashed border-gray-300 p-5 flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-700">Crea un nuovo template</p>
          <p className="text-xs text-gray-400">
            Definisci come Sonabrief struttura le sintesi per un tipo specifico di meeting — un formato legale, un briefing commerciale, un'intervista qualitativa.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={startFromScratch}
              className="flex-1 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-teal-600 hover:text-teal-700 transition-colors"
            >
              ✦ Personalizza da zero
            </button>
            <button
              onClick={startFromGeneric}
              disabled={!genericTemplate}
              className="flex-1 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-teal-600 hover:text-teal-700 transition-colors disabled:opacity-40"
            >
              ⊕ Usa struttura base
            </button>
          </div>
        </div>
      )}

      {/* I tuoi template */}
      {customTemplates.length > 0 && !editing && (
        <div className="w-full max-w-2xl flex flex-col gap-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Salvati ({customTemplates.length})
          </p>
          {customTemplates.map(t => (
            <div key={t.id} className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{LANG_LABEL[t.language] ?? t.language}</p>
                {t.description && <p className="text-xs text-gray-400 mt-1">{t.description}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(t)}
                  className="text-xs text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 hover:border-teal-600 hover:text-teal-700 transition-colors"
                >
                  Modifica
                </button>
                {deleteConfirm === t.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="text-xs text-red-600 border border-red-200 rounded-md px-2 py-1.5 hover:bg-red-50 transition-colors"
                    >
                      Conferma
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="text-xs text-gray-400 border border-gray-200 rounded-md px-2 py-1.5 transition-colors"
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(t.id)}
                    className="text-xs text-red-400 border border-gray-200 rounded-md px-3 py-1.5 hover:border-red-300 hover:text-red-600 transition-colors"
                  >
                    Elimina
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form editor */}
      {editing && (
        <div className="w-full max-w-2xl rounded-xl border border-teal-200 bg-teal-50 p-5 flex flex-col gap-4">
          <p className="text-sm font-semibold text-teal-800">
            {editing.id ? 'Modifica template' : 'Nuovo template'}
          </p>

          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-gray-500">Nome</label>
              <input
                type="text"
                value={editing.name ?? ''}
                placeholder="Es. Consulenza legale"
                onChange={e => setEditing(prev => ({ ...prev!, name: e.target.value }))}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Lingua</label>
              <select
                value={editing.language ?? 'it'}
                onChange={e => setEditing(prev => ({ ...prev!, language: e.target.value }))}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {LANG_OPTIONS.map(l => (
                  <option key={l} value={l}>{LANG_LABEL[l]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Descrizione (opzionale)</label>
            <input
              type="text"
              value={editing.description ?? ''}
              onChange={e => setEditing(prev => ({ ...prev!, description: e.target.value }))}
              placeholder="Es. Per consulenze legali in italiano"
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Prompt di sintesi</label>
            <p className="text-xs text-gray-400">
              Scrivi le istruzioni che l'AI seguirà per strutturare la sintesi. Usa <code className="bg-white px-1 rounded">**Titolo sezione**</code> per definire le sezioni.
            </p>
            <textarea
              value={editing.system_prompt ?? ''}
              onChange={e => setEditing(prev => ({ ...prev!, system_prompt: e.target.value }))}
              rows={14}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-teal-600 resize-y"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setEditing(null); setError(null) }}
              className="text-sm text-gray-400 border border-gray-200 bg-white rounded-md px-4 py-2 hover:border-gray-300 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={save}
              disabled={saving || !editing.name?.trim()}
              className="text-sm text-white bg-teal-700 rounded-md px-4 py-2 hover:bg-teal-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva template'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}