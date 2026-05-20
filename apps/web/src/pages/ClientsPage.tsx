import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, type Meeting } from '../lib/db'
import { AppNav } from '../components/AppNav'

function formatDate(ms: number) {
  return new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── UnassignedRow ─────────────────────────────────────────────────────────────

function UnassignedRow({ meeting }: { meeting: Meeting }) {
  const [client, setClient] = useState(meeting.clientName ?? '')
  const [stream, setStream] = useState(meeting.projectStream ?? '')

  async function save() {
    await db.meetings.update(meeting.id, {
      clientName: client.trim() || undefined,
      projectStream: stream.trim() || undefined,
    })
  }

  return (
    <div className="border-b border-border px-5 py-3 last:border-0">
      <p className="mb-1 text-sm font-medium text-foreground">{meeting.title}</p>
      <p className="mb-2 text-xs text-muted-foreground">{formatDate(meeting.startedAt)}</p>
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
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const navigate = useNavigate()
  const meetings = useLiveQuery(() => db.meetings.orderBy('startedAt').reverse().toArray(), [])
  const actionItems = useLiveQuery(() => db.action_items.where('completed').equals(0).toArray(), [])

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

  const assigned = meetings.filter(m => m.clientName?.trim())
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

  const isEmpty = clientList.length === 0 && unassigned.length === 0

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-8 font-heading text-2xl font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          Clienti & Progetti
        </h1>

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
              <ul className="flex flex-col gap-4" role="list">
                {clientList.map(([clientName, streams]) => {
                  const allMeetings = Object.values(streams).flat()
                  const totalOpen = allMeetings.reduce(
                    (sum, m) => sum + (openByMeeting[m.id] ?? 0), 0
                  )
                  const streamList = Object.entries(streams).sort(([a], [b]) =>
                    a === '— Generale' ? 1 : b === '— Generale' ? -1 : a.localeCompare(b)
                  )

                  return (
                    <li key={clientName}>
                      <div className="overflow-hidden rounded-lg border border-border bg-card">
                        {/* Client header — typography only, no tinted band */}
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                          <span className="text-sm font-semibold text-foreground">
                            {clientName}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {allMeetings.length} {allMeetings.length === 1 ? 'meeting' : 'meeting'}
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
                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                  {streamName}
                                </span>
                              </div>
                            )}
                            <ul className="divide-y divide-border" role="list">
                              {streamMeetings.map(m => (
                                <li key={m.id}>
                                  <button
                                    onClick={() => navigate('/archive', { state: { meetingId: m.id } })}
                                    className="w-full px-5 py-3 text-left transition-colors hover:bg-border motion-reduce:transition-none"
                                  >
                                    <p className="text-sm font-medium text-foreground">{m.title}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {formatDate(m.startedAt)}
                                      {openByMeeting[m.id]
                                        ? ` · ${openByMeeting[m.id]} azioni aperte`
                                        : ''}
                                    </p>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
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
                  {unassigned.map(m => (
                    <li key={m.id}>
                      <UnassignedRow meeting={m} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  )
}
