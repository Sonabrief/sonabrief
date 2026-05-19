import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, type Meeting } from '../lib/db'

function formatDate(ms: number) {
  return new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

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
    <div className="px-5 py-3 border-b border-gray-100 last:border-0">
      <p className="text-sm font-medium text-gray-900 mb-1">{meeting.title}</p>
      <p className="text-xs text-gray-400 mb-2">{formatDate(meeting.startedAt)}</p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Nome cliente..."
          value={client}
          onChange={e => setClient(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <input
          type="text"
          placeholder="Stream (es. Cause civili)..."
          value={stream}
          onChange={e => setStream(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && save()}
          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const meetings = useLiveQuery(() => db.meetings.orderBy('startedAt').reverse().toArray(), [])
  const actionItems = useLiveQuery(() => db.action_items.where('completed').equals(0).toArray(), [])

  if (!meetings) return <div className="p-8 text-sm text-gray-400">Caricamento...</div>

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

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 p-8">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clienti & Progetti</h1>
        <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 underline">
          Dashboard
        </button>
      </div>

      {clientList.length === 0 && unassigned.length === 0 && (
        <p className="text-sm text-gray-400">Nessun meeting ancora.</p>
      )}

      {clientList.map(([clientName, streams]) => {
        const allMeetings = Object.values(streams).flat()
        const totalOpen = allMeetings.reduce((sum, m) => sum + (openByMeeting[m.id] ?? 0), 0)
        const streamList = Object.entries(streams).sort(([a], [b]) =>
          a === '— Generale' ? 1 : b === '— Generale' ? -1 : a.localeCompare(b)
        )

        return (
          <div key={clientName} className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-teal-50 border-b border-gray-200">
              <span className="font-semibold text-teal-800">{clientName}</span>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{allMeetings.length} meeting</span>
                {totalOpen > 0 && (
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {totalOpen} azioni aperte
                  </span>
                )}
              </div>
            </div>

            {streamList.map(([streamName, streamMeetings]) => (
              <div key={streamName}>
                {streamList.length > 1 && (
                  <div className="px-5 py-1.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{streamName}</span>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {streamMeetings.map(m => (
                    <button
                      key={m.id}
                      onClick={() => navigate('/archive', { state: { meetingId: m.id } })}
                      className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900">{m.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(m.startedAt)}
                        {openByMeeting[m.id] ? ` · ${openByMeeting[m.id]} azioni aperte` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {unassigned.length > 0 && (
        <div className="w-full max-w-2xl rounded-xl border border-dashed border-gray-300 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-400">Non assegnati ({unassigned.length})</span>
          </div>
          {unassigned.map(m => (
            <UnassignedRow key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  )
}