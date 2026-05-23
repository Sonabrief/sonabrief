import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AppNav } from '../components/AppNav'
import { db, type Meeting, type Note, type Transcript } from '../lib/db'
import { SynthesisEditor } from '../components/SynthesisEditor'
import { exportMarkdown, exportPDF, exportWord, exportEmail, copyFormatted } from '../lib/export'
import { TagInput, TagPill } from '../components/TagInput'
import { ProGate } from '../components/ProGate'

const LANG_LABEL: Record<string, string> = {
  it: 'Italiano',
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatMinutes(seconds?: number): string {
  if (!seconds) return '—'
  const m = Math.ceil(seconds / 60)
  return `${m} min`
}

export default function ArchivePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null)
  const [copyDone, setCopyDone] = useState(false)
  const [editingClient, setEditingClient] = useState('')
  const [editingStream, setEditingStream] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'synthesis' | 'transcript'>('synthesis')

  const meetings = useLiveQuery(
    () => db.meetings.orderBy('startedAt').reverse().toArray(),
    []
  )

  const filtered = meetings?.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase()) &&
    (filterTag === null || m.tags?.includes(filterTag))
  ) ?? []

  async function handleSelect(meeting: Meeting) {
    setSelectedMeeting(meeting)
    setActiveTab('synthesis')
    const note = await db.notes.where('meetingId').equals(meeting.id).first()
    setSelectedNote(note ?? null)
    const transcript = await db.transcripts.where('meetingId').equals(meeting.id).first()
    setSelectedTranscript(transcript ?? null)
    setEditingClient(meeting.clientName ?? '')
    setEditingStream(meeting.projectStream ?? '')
  }

  async function saveTags(tags: string[]) {
    if (selectedMeeting) {
      await db.meetings.update(selectedMeeting.id, { tags })
      setSelectedMeeting(prev => prev ? { ...prev, tags } : prev)
    }
  }

  async function saveClientFields() {
    if (selectedMeeting) {
      await db.meetings.update(selectedMeeting.id, {
        clientName: editingClient.trim() || undefined,
        projectStream: editingStream.trim() || undefined,
      })
    }
  }

  function buildExportData() {
    return {
      title: selectedMeeting!.title,
      date: formatDate(selectedMeeting!.startedAt),
      duration: formatMinutes(selectedMeeting!.durationSeconds),
      lang: LANG_LABEL[selectedMeeting!.lang ?? 'it'] ?? selectedMeeting!.lang ?? 'IT',
      content: selectedNote!.content,
    }
  }

  function buildTranscriptExportData() {
    return {
      title: selectedMeeting!.title,
      date: formatDate(selectedMeeting!.startedAt),
      duration: formatMinutes(selectedMeeting!.durationSeconds),
      lang: LANG_LABEL[selectedMeeting!.lang ?? 'it'] ?? selectedMeeting!.lang ?? 'IT',
      content: selectedTranscript!.text,
    }
  }

  const exportActions = [
    { label: 'Markdown', fn: () => exportMarkdown(buildExportData()) },
    { label: 'PDF', fn: () => exportPDF(buildExportData()) },
    { label: 'Word', fn: () => exportWord(buildExportData()) },
    { label: 'Email', fn: () => exportEmail(buildExportData()) },
    {
      label: copyDone ? 'Copiato' : 'Copia testo',
      fn: async () => {
        await copyFormatted(buildExportData())
        setCopyDone(true)
        setTimeout(() => setCopyDone(false), 2000)
      },
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-8 font-heading text-[clamp(1.875rem,4vw,3rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
          Archivio
        </h1>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_2fr] md:gap-8">

          {/* ── List ──────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <input
              type="text"
              aria-label="Cerca per titolo"
              placeholder="Cerca per titolo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            />

            {/* Tag filter chips */}
            {(() => {
              const allTags = [...new Set(meetings?.flatMap(m => m.tags ?? []) ?? [])]
              if (allTags.length === 0) return null
              return (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setFilterTag(f => f === tag ? null : tag)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        filterTag === tag
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )
            })()}

            {meetings === undefined ? (
              <div className="animate-pulse space-y-2 pt-1">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-18 rounded-lg bg-border" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="pt-4">
                <p className="text-sm font-semibold text-foreground">
                  {search ? 'Nessun risultato' : 'Archivio vuoto'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {search
                    ? 'Prova con un termine diverso.'
                    : 'Registra il tuo primo meeting per iniziare.'}
                </p>
                {!search && (
                  <button
                    onClick={() => navigate('/recording')}
                    className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) motion-reduce:transition-none"
                  >
                    Avvia registrazione
                  </button>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-2" role="list">
                {filtered.map((meeting, i) => {
                  const isSelected = selectedMeeting?.id === meeting.id
                  return (
                    <motion.li
                      key={meeting.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, delay: i * 0.04, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <button
                        onClick={() => handleSelect(meeting)}
                        aria-selected={isSelected}
                        className={`w-full rounded-lg border px-5 py-4 text-left transition-colors motion-reduce:transition-none ${
                          isSelected
                            ? 'border-primary bg-secondary'
                            : 'border-border bg-card hover:bg-border'
                        }`}
                      >
                        <p className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          {meeting.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(meeting.startedAt)}
                          {' · '}
                          {LANG_LABEL[meeting.lang ?? 'it'] ?? meeting.lang}
                          {' · '}
                          {formatMinutes(meeting.durationSeconds)}
                        </p>
                        {meeting.tags && meeting.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {meeting.tags.map(tag => <TagPill key={tag} tag={tag} />)}
                          </div>
                        )}
                        {!meeting.hasSynthesis && (
                          <span className="mt-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Solo trascrizione
                          </span>
                        )}
                      </button>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ── Detail ────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card">
            <AnimatePresence mode="wait">
              {!selectedMeeting ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex min-h-80 flex-col items-center justify-center p-8 text-center"
                >
                  <p className="text-sm font-semibold text-foreground">Seleziona un meeting</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    La sintesi del meeting selezionato verrà mostrata qui.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key={selectedMeeting.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="flex flex-col gap-5 p-6"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <input
                      type="text"
                      placeholder="Nome cliente"
                      value={editingClient}
                      onChange={e => setEditingClient(e.target.value)}
                      onBlur={saveClientFields}
                      onKeyDown={e => e.key === 'Enter' && saveClientFields()}
                      className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                    />
                    <input
                      type="text"
                      placeholder="Stream / progetto"
                      value={editingStream}
                      onChange={e => setEditingStream(e.target.value)}
                      onBlur={saveClientFields}
                      onKeyDown={e => e.key === 'Enter' && saveClientFields()}
                      className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                    />
                  </div>
                  <ProGate feature="Tag meeting">
                    <TagInput
                      value={selectedMeeting.tags ?? []}
                      onChange={saveTags}
                    />
                  </ProGate>

                  {selectedMeeting.hasSynthesis === false ? (
                    selectedTranscript ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Trascrizione
                      </p>
                      <div className="max-h-125 overflow-y-auto rounded-md border border-border bg-muted/30 p-4">
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                          {selectedTranscript.text}
                        </pre>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                        <button onClick={() => exportMarkdown(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Markdown</button>
                        <button onClick={() => exportPDF(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">PDF</button>
                        <button onClick={() => exportWord(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Word</button>
                        <button onClick={() => exportEmail(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Email</button>
                        <button onClick={() => navigator.clipboard.writeText(selectedTranscript!.text)} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Copia testo</button>
                      </div>
                    </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nessun contenuto disponibile.</p>
                    )
                  ) : selectedNote ? (
                    <>
                      <div className="flex gap-1 border-b border-border pb-3">
                        <button
                          onClick={() => setActiveTab('synthesis')}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'synthesis' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Sintesi
                        </button>
                        <button
                          onClick={() => setActiveTab('transcript')}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'transcript' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Trascrizione
                        </button>
                      </div>
                      {activeTab === 'synthesis' && (
                        <>
                          <SynthesisEditor content={selectedNote.content} readonly />
                          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                            {exportActions.map(btn => (
                              <button
                                key={btn.label}
                                onClick={btn.fn}
                                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none"
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {activeTab === 'transcript' && (
                        selectedTranscript ? (
                          <>
                            <div className="max-h-125 overflow-y-auto rounded-md border border-border bg-muted/30 p-4">
                              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                                {selectedTranscript.text}
                              </pre>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                              <button onClick={() => exportMarkdown(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Markdown</button>
                              <button onClick={() => exportPDF(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">PDF</button>
                              <button onClick={() => exportWord(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Word</button>
                              <button onClick={() => exportEmail(buildTranscriptExportData())} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Email</button>
                              <button onClick={() => navigator.clipboard.writeText(selectedTranscript!.text)} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground motion-reduce:transition-none">Copia testo</button>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Trascrizione non disponibile.</p>
                        )
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessuna sintesi disponibile.</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </main>
    </div>
  )
}
