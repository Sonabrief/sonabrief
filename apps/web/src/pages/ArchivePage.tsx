import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
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

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 p-8">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Archivio meeting</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-400 underline"
        >
          Dashboard
        </button>
      </div>

      <div className="w-full max-w-2xl">
        <input
          type="text"
          placeholder="Cerca per titolo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
      </div>

      {meetings === undefined && (
        <p className="text-sm text-gray-400">Caricamento...</p>
      )}

      {meetings !== undefined && filtered.length === 0 && (
        <p className="text-sm text-gray-400">Nessun meeting trovato.</p>
      )}

      <div className="w-full max-w-2xl flex flex-col gap-3">
        {filtered.map(meeting => (
          <button
            key={meeting.id}
            onClick={() => handleSelect(meeting)}
            className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
              selectedMeeting?.id === meeting.id
                ? 'border-teal-600 bg-teal-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-medium text-gray-900">{meeting.title}</p>
            <p className="mt-1 text-xs text-gray-400">
              {formatDate(meeting.startedAt)}
              {' · '}
              {LANG_LABEL[meeting.lang ?? 'it'] ?? meeting.lang}
              {' · '}
              {formatMinutes(meeting.durationSeconds)}
            </p>
          </button>
        ))}
      </div>

      {selectedMeeting && (
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <p className="text-xs font-medium text-teal-700 uppercase tracking-wide">
            Sintesi — {selectedMeeting.title}
          </p>
          {selectedNote ? (
            <>
              <SynthesisEditor content={selectedNote.content} readonly />

              <div className="flex flex-wrap gap-2 pt-2">
                {[
                  { label: 'Markdown', action: () => exportMarkdown(buildExportData()) },
                  { label: 'PDF', action: () => exportPDF(buildExportData()) },
                  { label: 'Word', action: () => exportWord(buildExportData()) },
                  { label: 'Email', action: () => exportEmail(buildExportData()) },
                  {
                    label: copyDone ? 'Copiato ✓' : 'Copia testo',
                    action: async () => {
                      await copyFormatted(buildExportData())
                      setCopyDone(true)
                      setTimeout(() => setCopyDone(false), 2000)
                    },
                  },
                ].map(btn => (
                  <button
                    key={btn.label}
                    onClick={btn.action}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-teal-600 hover:text-teal-700 transition-colors"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">Nessuna sintesi disponibile.</p>
          )}
        </div>
      )}
    </div>
  )
}
