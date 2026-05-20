import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AppNav } from '../components/AppNav'
import { db, type Meeting, type Note } from '../lib/db'
import { SynthesisEditor } from '../components/SynthesisEditor'
import { exportMarkdown, exportPDF, exportWord, exportEmail, copyFormatted } from '../lib/export'

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
  const [copyDone, setCopyDone] = useState(false)
  const [editingClient, setEditingClient] = useState('')
  const [editingStream, setEditingStream] = useState('')

  const meetings = useLiveQuery(
    () => db.meetings.orderBy('startedAt').reverse().toArray(),
    []
  )

  const filtered = meetings?.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  async function handleSelect(meeting: Meeting) {
    setSelectedMeeting(meeting)
    const note = await db.notes.where('meetingId').equals(meeting.id).first()
    setSelectedNote(note ?? null)
    setEditingClient(meeting.clientName ?? '')
    setEditingStream(meeting.projectStream ?? '')
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
                {filtered.map(meeting => {
                  const isSelected = selectedMeeting?.id === meeting.id
                  return (
                    <li key={meeting.id}>
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
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ── Detail ────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card">
            {!selectedMeeting ? (
              <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
                <p className="text-sm font-semibold text-foreground">Seleziona un meeting</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  La sintesi del meeting selezionato verrà mostrata qui.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 p-6">
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

                {selectedNote ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna sintesi disponibile.</p>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
