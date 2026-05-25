import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { db, type Meeting } from '../lib/db'
import { AppNav } from '../components/AppNav'
import { SynthesisEditor } from '../components/SynthesisEditor'
import { TranscriptViewer, type WhisperSegment } from '../components/TranscriptViewer'

function formatDate(ms: number) {
  return new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── UnassignedRow ─────────────────────────────────────────────────────────────

function UnassignedRow({
  meeting,
  notesByMeeting,
}: {
  meeting: Meeting
  notesByMeeting: Record<string, string>
}) {
  const [client, setClient] = useState(meeting.clientName ?? '')
  const [stream, setStream] = useState(meeting.projectStream ?? '')
  const [expanded, setExpanded] = useState(false)

  async function save() {
    await db.meetings.update(meeting.id, {
      clientName: client.trim() || undefined,
      projectStream: stream.trim() || undefined,
    })
  }

  return (
    <div className="border-b border-border px-5 py-3 last:border-0">
      <div className="mb-2 flex items-baseline gap-2">
        <p className="text-sm font-medium text-foreground">{meeting.title}</p>
        <span className="text-xs text-muted-foreground">
          {new Date(meeting.startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Nome cliente"
          placeholder="Nome cliente..."
          value={client}
          onChange={e => setClient(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        />
        <input
          type="text"
          aria-label="Stream / progetto"
          placeholder="Stream (es. Cause civili)..."
          value={stream}
          onChange={e => setStream(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        />
      </div>

      <button
        onClick={() => setExpanded(e => !e)}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
      >
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
        {expanded ? 'Chiudi sintesi' : 'Mostra sintesi'}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-md border border-border bg-background px-4 py-3">
              {notesByMeeting[meeting.id] ? (
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                  {notesByMeeting[meeting.id]}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Nessuna sintesi disponibile.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const navigate = useNavigate()
  const meetings = useLiveQuery(() => db.meetings.orderBy('startedAt').reverse().toArray(), [])
  const actionItems = useLiveQuery(() => db.action_items.where('completed').equals(0).toArray(), [])
  const notes = useLiveQuery(() => db.notes.toArray(), [])
  const transcripts = useLiveQuery(() => db.transcripts.toArray(), [])

  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null)
  const [filterClient, setFilterClient] = useState<string>('all')
  const [filterStream, setFilterStream] = useState<string>('all')
  const [searchClient, setSearchClient] = useState('')
  const [unassignedExpanded, setUnassignedExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<Record<string, 'synthesis' | 'transcript'>>({})
  const [renamingClient, setRenamingClient] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const UNASSIGNED_PREVIEW = 3

  useEffect(() => { setFilterStream('all') }, [filterClient])

  const notesByMeeting = useMemo(() => {
    const map: Record<string, string> = {}
    for (const n of notes ?? []) map[n.meetingId] = n.content
    return map
  }, [notes])

  const transcriptByMeeting = useMemo(() => {
    const map: Record<string, { text: string; segments: string }> = {}
    for (const t of transcripts ?? []) map[t.meetingId] = { text: t.text, segments: t.segments ?? '[]' }
    return map
  }, [transcripts])

  async function renameClient(oldName: string, newName: string) {
    if (!newName.trim() || newName.trim() === oldName) {
      setRenamingClient(null)
      return
    }
    const toUpdate = (meetings ?? []).filter(m => m.clientName?.trim() === oldName)
    await Promise.all(toUpdate.map(m => db.meetings.update(m.id, { clientName: newName.trim() })))
    setRenamingClient(null)
  }

  const assigned = useMemo(
    () => (meetings ?? []).filter(m => m.clientName?.trim()),
    [meetings]
  )

  const allClients = useMemo(
    () => [...new Set(assigned.map(m => m.clientName!.trim()))].sort(),
    [assigned]
  )

  const allStreams = useMemo(() => {
    const source = filterClient === 'all'
      ? assigned
      : assigned.filter(m => m.clientName!.trim() === filterClient)
    return [...new Set(source.map(m => m.projectStream?.trim() || '— Generale'))].sort(
      (a, b) => a === '— Generale' ? 1 : b === '— Generale' ? -1 : a.localeCompare(b)
    )
  }, [assigned, filterClient])

  if (!meetings) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded-md bg-border" />
            {[0, 1, 2].map(i => (
              <div key={i} className="h-32 rounded-lg bg-border" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const openByMeeting: Record<string, number> = {}
  for (const ai of actionItems ?? []) {
    openByMeeting[ai.meetingId] = (openByMeeting[ai.meetingId] ?? 0) + 1
  }

  const unassigned = meetings.filter(m => !m.clientName?.trim())

  const byClient: Record<string, Record<string, Meeting[]>> = {}
  for (const m of assigned) {
    const client = m.clientName!.trim()
    const stream = m.projectStream?.trim() || '— Generale'
    if (!byClient[client]) byClient[client] = {}
    if (!byClient[client][stream]) byClient[client][stream] = []
    byClient[client][stream].push(m)
  }

  const clientList = Object.entries(byClient).sort(([a], [b]) => a.localeCompare(b))

  const filteredClientList = clientList
    .filter(([clientName]) =>
      searchClient === '' || clientName.toLowerCase().includes(searchClient.toLowerCase())
    )
    .filter(([clientName]) => filterClient === 'all' || clientName === filterClient)
    .map(([clientName, streams]) => {
      if (filterStream === 'all') return [clientName, streams] as const
      const filtered = Object.fromEntries(
        Object.entries(streams).filter(([s]) => s === filterStream)
      )
      return [clientName, filtered] as const
    })
    .filter(([, streams]) => Object.keys(streams).length > 0)

  const isEmpty = clientList.length === 0 && unassigned.length === 0

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-6 font-heading text-2xl font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          Clienti & Progetti
        </h1>

        {clientList.length > 2 && (
          <input
            type="text"
            placeholder="Cerca cliente..."
            value={searchClient}
            onChange={e => setSearchClient(e.target.value)}
            className="mb-4 w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          />
        )}

        {isEmpty ? (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-foreground">Nessun meeting ancora</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Dopo la prima registrazione potrai assegnare i meeting a clienti e progetti.
            </p>
            <button
              onClick={() => navigate('/recording')}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              Avvia registrazione
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* ── Client cards ─────────────────────────────── */}
            {clientList.length > 0 && (
              <>
                {/* Filtri cliente / stream */}
                {clientList.length > 1 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtra per cliente">
                      <button
                        onClick={() => setFilterClient('all')}
                        aria-pressed={filterClient === 'all'}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                          filterClient === 'all'
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border bg-card text-muted-foreground hover:bg-border'
                        }`}
                      >
                        Tutti
                      </button>
                      {allClients.map(c => (
                        <button
                          key={c}
                          onClick={() => setFilterClient(c)}
                          aria-pressed={filterClient === c}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                            filterClient === c
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-border bg-card text-muted-foreground hover:bg-border'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>

                    {filterClient !== 'all' && allStreams.length > 1 && (
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtra per stream">
                        <button
                          onClick={() => setFilterStream('all')}
                          aria-pressed={filterStream === 'all'}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                            filterStream === 'all'
                              ? 'bg-secondary text-primary'
                              : 'border border-border bg-card text-muted-foreground hover:bg-border'
                          }`}
                        >
                          Tutti gli stream
                        </button>
                        {allStreams.map(s => (
                          <button
                            key={s}
                            onClick={() => setFilterStream(s)}
                            aria-pressed={filterStream === s}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                              filterStream === s
                                ? 'bg-secondary text-primary'
                                : 'border border-border bg-card text-muted-foreground hover:bg-border'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <ul className="flex flex-col gap-4" role="list">
                  {filteredClientList.map(([clientName, streams], i) => {
                    const allMeetingsInCard = Object.values(streams).flat()
                    const totalOpen = allMeetingsInCard.reduce(
                      (sum, m) => sum + (openByMeeting[m.id] ?? 0), 0
                    )
                    const streamList = Object.entries(streams).sort(([a], [b]) =>
                      a === '— Generale' ? 1 : b === '— Generale' ? -1 : a.localeCompare(b)
                    )

                    return (
                      <motion.li
                        key={clientName}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: i * 0.05, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <div className="overflow-hidden rounded-lg border border-border bg-card">
                          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-4">
                            {renamingClient === clientName ? (
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onBlur={() => renameClient(clientName, renameValue)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') renameClient(clientName, renameValue)
                                  if (e.key === 'Escape') setRenamingClient(null)
                                }}
                                className="rounded border border-primary bg-card px-2 py-0.5 text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              />
                            ) : (
                              <button
                                onDoubleClick={() => { setRenamingClient(clientName); setRenameValue(clientName) }}
                                className="text-base font-bold text-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                                title="Doppio click per rinominare"
                              >
                                {clientName}
                              </button>
                            )}
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {allMeetingsInCard.length} meeting
                              </span>
                              {totalOpen > 0 && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-primary">
                                  {totalOpen} azioni aperte
                                </span>
                              )}
                            </div>
                          </div>

                          {streamList.map(([streamName, streamMeetings]) => (
                            <div key={streamName}>
                              {streamList.length > 1 && (
                                <div className="border-b border-border bg-muted px-5 py-1.5">
                                  <span className="text-xs font-semibold text-muted-foreground">
                                    {streamName}
                                  </span>
                                </div>
                              )}
                              <ul className="divide-y divide-border" role="list">
                                {streamMeetings.map(m => (
                                  <li key={m.id}>
                                    <>
                                      <button
                                        onClick={() => setExpandedMeetingId(id => id === m.id ? null : m.id)}
                                        className="w-full px-5 py-3 text-left transition-colors hover:bg-border motion-reduce:transition-none"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div>
                                            <p className="text-sm font-medium text-foreground">{m.title}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                              {formatDate(m.startedAt)}
                                              {openByMeeting[m.id] ? ` · ${openByMeeting[m.id]} azioni aperte` : ''}
                                            </p>
                                          </div>
                                          <ChevronDown
                                            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${
                                              expandedMeetingId === m.id ? 'rotate-180' : ''
                                            }`}
                                          />
                                        </div>
                                      </button>

                                      <AnimatePresence>
                                        {expandedMeetingId === m.id && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                            className="overflow-hidden border-t border-border"
                                          >
                                            <div className="px-5 py-4">
                                              <div className="mb-4 flex gap-1 border-b border-border pb-3">
                                                <button
                                                  onClick={() => setActiveTab(prev => ({ ...prev, [m.id]: 'synthesis' }))}
                                                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${
                                                    (activeTab[m.id] ?? 'synthesis') === 'synthesis'
                                                      ? 'bg-primary/10 text-primary'
                                                      : 'text-muted-foreground hover:text-foreground'
                                                  }`}
                                                >Sintesi</button>
                                                <button
                                                  onClick={() => setActiveTab(prev => ({ ...prev, [m.id]: 'transcript' }))}
                                                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${
                                                    activeTab[m.id] === 'transcript'
                                                      ? 'bg-primary/10 text-primary'
                                                      : 'text-muted-foreground hover:text-foreground'
                                                  }`}
                                                >Trascrizione</button>
                                              </div>

                                              {(activeTab[m.id] ?? 'synthesis') === 'synthesis' ? (
                                                notesByMeeting[m.id] ? (
                                                  <>
                                                    <SynthesisEditor content={notesByMeeting[m.id]} readonly />
                                                    <button
                                                      onClick={() => navigate('/archive', { state: { meetingId: m.id } })}
                                                      className="mt-3 text-xs font-medium text-primary transition-colors hover:underline motion-reduce:transition-none"
                                                    >
                                                      Apri in archivio →
                                                    </button>
                                                  </>
                                                ) : (
                                                  <p className="text-xs text-muted-foreground">Nessuna sintesi disponibile.</p>
                                                )
                                              ) : (
                                                transcriptByMeeting[m.id] ? (
                                                  <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                                                    <TranscriptViewer
                                                      segments={(() => { try { return JSON.parse(transcriptByMeeting[m.id].segments) as WhisperSegment[] } catch { return [] } })()}
                                                      rawText={transcriptByMeeting[m.id].text}
                                                      showTimestamps={false}
                                                      onToggleTimestamps={() => {}}
                                                    />
                                                  </div>
                                                ) : (
                                                  <p className="text-xs text-muted-foreground">Trascrizione non disponibile.</p>
                                                )
                                              )}
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </motion.li>
                    )
                  })}
                </ul>
              </>
            )}

            {/* ── Unassigned ───────────────────────────────── */}
            {unassigned.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="border-b border-border px-5 py-4">
                  <span className="text-sm font-medium text-muted-foreground">
                    Non assegnati ({unassigned.length})
                  </span>
                </div>
                <ul role="list">
                  {(unassigned.length <= UNASSIGNED_PREVIEW || unassignedExpanded
                    ? unassigned
                    : unassigned.slice(0, UNASSIGNED_PREVIEW)
                  ).map(m => (
                    <li key={m.id}>
                      <UnassignedRow meeting={m} notesByMeeting={notesByMeeting} />
                    </li>
                  ))}
                </ul>
                {unassigned.length > UNASSIGNED_PREVIEW && (
                  !unassignedExpanded ? (
                    <button
                      onClick={() => setUnassignedExpanded(true)}
                      className="w-full border-t border-border py-2.5 text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                    >
                      Mostra tutti ({unassigned.length - UNASSIGNED_PREVIEW} altri)
                    </button>
                  ) : (
                    <button
                      onClick={() => setUnassignedExpanded(false)}
                      className="w-full border-t border-border py-2.5 text-xs text-muted-foreground transition-colors hover:text-primary motion-reduce:transition-none"
                    >
                      Mostra meno
                    </button>
                  )
                )}
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  )
}
