import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
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

const GENERIC_IDS: Record<string, string> = {
  it: 'sys_generic_it_v2',
  en: 'sys_generic_en_v1',
  fr: 'sys_generic_fr_v1',
  es: 'sys_generic_es_v1',
  de: 'sys_generic_de_v1',
}

const inputClass =
  'w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none'

function extractSections(prompt: string): string[] {
  const matches = prompt.match(/\*\*([^*]+)\*\*/g) ?? []
  return matches.map(m => m.replace(/\*\*/g, '').trim()).filter(Boolean)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { t } = useTranslation()
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

  const genericTemplate = templates.find(t => t.id === GENERIC_IDS[i18n.language])
    ?? templates.find(t => t.id === GENERIC_IDS['it'])
  const customTemplates = templates.filter(t => !t.is_system)

  function startFromScratch() {
    setError(null)
    setEditing({ name: '', description: '', language: i18n.language, system_prompt: '' })
  }

  function startFromGeneric() {
    setError(null)
    setEditing({
      name: '',
      description: '',
      language: genericTemplate?.language ?? i18n.language,
      system_prompt: genericTemplate?.system_prompt ?? '',
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
        setError(t('templates.error_pro_required'))
      else if (body.error === 'template_limit_reached')
        setError(t('templates.error_limit', { limit: body.limit }))
      else setError(t('templates.error_save'))
      return
    }
    if (!r.ok) { setError(t('templates.error_save')); return }
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
          {t('templates.title')}
        </h1>

        {loading && (
          <p className="text-sm text-muted-foreground">{t('templates.loading')}</p>
        )}

        <div className="flex flex-col gap-5">

          {/* ── Create card ──────────────────────────── */}
          {!editing && (
            <div className="rounded-lg border border-border p-5">
              <p className="text-sm font-semibold text-foreground">{t('templates.create_new')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('templates.create_hint')}
              </p>
              {isFree ? (
                <div className="mt-4 space-y-4">
                  {/* Ghost card — form bloccato */}
                  <div className="relative rounded-lg border border-dashed border-border bg-muted/20 px-5 py-4 select-none pointer-events-none opacity-50">
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1 rounded-md border border-border bg-card px-3 py-1.5">
                        <p className="text-xs text-muted-foreground">{t('templates.name_label')}</p>
                      </div>
                      <div className="w-28 rounded-md border border-border bg-card px-3 py-1.5">
                        <p className="text-xs text-muted-foreground">{t('templates.language_label')}</p>
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-card px-3 py-2 mb-3">
                      <p className="text-xs text-muted-foreground">{t('templates.prompt_placeholder')}</p>
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
                        <p className="text-sm font-medium text-foreground">{t('templates.pro_upsell_title')}</p>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          {t('templates.pro_upsell_hint')}
                        </p>
                      </div>
                      <a
                        href="/pricing"
                        className="shrink-0 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        {t('templates.upgrade_pro')}
                      </a>
                    </div>
                  </div>

                  {/* Template di sistema — compatti */}
                  {templates.filter(t => t.is_system && t.language === i18n.language).length > 0 && (
                    <div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {t('templates.included_label')}
                      </p>
                      <ul className="flex flex-col gap-1.5" role="list">
                        {templates.filter(t => t.is_system && t.language === i18n.language).map(t => (
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
                    {t('templates.use_base')}
                  </button>
                  <button
                    onClick={startFromScratch}
                    className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                  >
                    {t('templates.customize')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Saved templates ──────────────────────── */}
          {customTemplates.length > 0 && !editing && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('templates.saved_label', { count: customTemplates.length })}
              </p>
              <ul className="flex flex-col gap-2" role="list">
                {customTemplates.map((tmpl, i) => (
                  <motion.li
                    key={tmpl.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.16, delay: i * 0.05 }}
                  >
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{tmpl.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {LANG_LABEL[tmpl.language] ?? tmpl.language}
                        </p>
                        {tmpl.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{tmpl.description}</p>
                        )}
                        {(() => {
                          const sections = extractSections(tmpl.system_prompt)
                          if (sections.length === 0) return null
                          return (
                            <div className="mt-2">
                              <button
                                onClick={() => setExpandedPreview(id => id === tmpl.id ? null : tmpl.id)}
                                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                              >
                                <ChevronDown className={`h-3 w-3 transition-transform duration-200 motion-reduce:transition-none ${expandedPreview === tmpl.id ? 'rotate-180' : ''}`} />
                                {expandedPreview === tmpl.id ? t('templates.hide_structure') : t('templates.show_structure')}
                              </button>
                              <AnimatePresence>
                                {expandedPreview === tmpl.id && (
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
                          onClick={() => startEdit(tmpl)}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                        >
                          {t('templates.edit')}
                        </button>
                        {deleteConfirm === tmpl.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => deleteTemplate(tmpl.id)}
                              className="rounded-md border border-destructive/30 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 motion-reduce:transition-none"
                            >
                              {t('templates.confirm')}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                            >
                              {t('templates.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(tmpl.id)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive motion-reduce:transition-none"
                          >
                            {t('templates.delete')}
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
                {editing.id ? t('templates.edit_title') : t('templates.new_title')}
              </h2>

              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="template-name" className="text-xs font-medium text-muted-foreground">
                      {t('templates.editor_name_label')}
                    </label>
                    <input
                      id="template-name"
                      type="text"
                      value={editing.name ?? ''}
                      placeholder={t('templates.editor_name_placeholder')}
                      onChange={e => setEditing(prev => ({ ...prev!, name: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex w-36 flex-col gap-1">
                    <label htmlFor="template-language" className="text-xs font-medium text-muted-foreground">
                      {t('templates.language_label')}
                    </label>
                    <select
                      id="template-language"
                      value={editing.language ?? i18n.language}
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
                    {t('templates.editor_desc_label')}
                  </label>
                  <input
                    id="template-description"
                    type="text"
                    value={editing.description ?? ''}
                    onChange={e => setEditing(prev => ({ ...prev!, description: e.target.value }))}
                    placeholder={t('templates.editor_desc_placeholder')}
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="template-prompt" className="text-xs font-medium text-muted-foreground">
                    {t('templates.editor_prompt_label')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('templates.prompt_hint_before')}{' '}
                    <code className="rounded bg-muted px-1 font-mono text-foreground">
                      {t('templates.prompt_hint_code')}
                    </code>{' '}
                    {t('templates.prompt_hint_after')}
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
                    {t('templates.cancel')}
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || !editing.name?.trim()}
                    aria-busy={saving}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
                  >
                    {saving ? t('templates.saving') : t('templates.save_btn')}
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
