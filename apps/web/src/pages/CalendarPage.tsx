import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  attendees: { email: string; name?: string }[]
}

interface CalendarState {
  connected: boolean
  events: CalendarEvent[]
  error?: string
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const [google, setGoogle] = useState<CalendarState | null>(null)
  const [microsoft, setMicrosoft] = useState<CalendarState | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<'google' | 'microsoft' | null>(null)

  async function loadCalendars() {
    setLoading(true)
    const [gRes, mRes] = await Promise.all([
      fetch(`${API_URL}/v1/calendar/events`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/v1/calendar/microsoft/events`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ])
    setGoogle(gRes)
    setMicrosoft(mRes)
    setLoading(false)
  }

  useEffect(() => { loadCalendars() }, [])

  async function connectGoogle() {
    setConnecting('google')
    const res = await fetch(`${API_URL}/auth/google/start`, { credentials: 'include' })
    const data = await res.json() as { url: string }
    window.location.href = data.url
  }

  async function connectMicrosoft() {
    setConnecting('microsoft')
    const res = await fetch(`${API_URL}/auth/microsoft/start`, { credentials: 'include' })
    const data = await res.json() as { url: string }
    window.location.href = data.url
  }

  async function disconnectGoogle() {
    await fetch(`${API_URL}/v1/calendar/disconnect`, { method: 'POST', credentials: 'include' })
    setGoogle(null)
    loadCalendars()
  }

  async function disconnectMicrosoft() {
    await fetch(`${API_URL}/v1/calendar/microsoft/disconnect`, { method: 'POST', credentials: 'include' })
    setMicrosoft(null)
    loadCalendars()
  }

  const allEvents = [
    ...(google?.events ?? []).map(e => ({ ...e, provider: 'google' as const })),
    ...(microsoft?.events ?? []).map(e => ({ ...e, provider: 'microsoft' as const })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return (
    <div className="min-h-screen bg-[#FAF7F0] px-6 py-10">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">

        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-[#1A4D52]" style={{ fontFamily: '"Instrument Serif", serif' }}>
            Calendario
          </h1>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 underline">
            ← Dashboard
          </button>
        </div>

        {/* Provider cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Google */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📅</span>
                <span className="text-sm font-medium text-gray-700">Google Calendar</span>
              </div>
              {google?.connected ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Connesso</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Non connesso</span>
              )}
            </div>
            {google?.connected ? (
              <button
                onClick={disconnectGoogle}
                className="text-xs text-red-500 underline"
              >
                Disconnetti
              </button>
            ) : (
              <button
                onClick={connectGoogle}
                disabled={connecting === 'google'}
                className="w-full rounded-lg border border-[#1A4D52] px-3 py-2 text-sm text-[#1A4D52] hover:bg-teal-50 transition-colors disabled:opacity-50"
              >
                {connecting === 'google' ? 'Connessione...' : 'Connetti Google Calendar'}
              </button>
            )}
          </div>

          {/* Microsoft */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📆</span>
                <span className="text-sm font-medium text-gray-700">Microsoft 365</span>
              </div>
              {microsoft?.connected ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Connesso</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Non connesso</span>
              )}
            </div>
            {microsoft?.connected ? (
              <button
                onClick={disconnectMicrosoft}
                className="text-xs text-red-500 underline"
              >
                Disconnetti
              </button>
            ) : (
              <button
                onClick={connectMicrosoft}
                disabled={connecting === 'microsoft'}
                className="w-full rounded-lg border border-[#1A4D52] px-3 py-2 text-sm text-[#1A4D52] hover:bg-teal-50 transition-colors disabled:opacity-50"
              >
                {connecting === 'microsoft' ? 'Connessione...' : 'Connetti Microsoft 365'}
              </button>
            )}
          </div>
        </div>

        {/* Prossimi eventi */}
        {loading && (
          <p className="text-sm text-gray-400 text-center">Caricamento...</p>
        )}

        {!loading && !google?.connected && !microsoft?.connected && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              Connetti il tuo calendario per vedere i prossimi meeting e ricevere briefing automatici prima di ogni call.
            </p>
          </div>
        )}

        {!loading && allEvents.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Prossimi 7 giorni
            </p>
            {allEvents.map(event => (
              <div
                key={`${event.provider}-${event.id}`}
                className="rounded-xl border border-gray-200 bg-white px-5 py-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{event.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatEventDate(event.start)} · {formatDuration(event.start, event.end)}
                    </p>
                    {event.attendees.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {event.attendees.slice(0, 3).map(a => a.name ?? a.email).join(', ')}
                        {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    event.provider === 'google'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-purple-50 text-purple-600'
                  }`}>
                    {event.provider === 'google' ? 'Google' : 'Microsoft'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && (google?.connected || microsoft?.connected) && allEvents.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
            <p className="text-sm text-gray-400">Nessun meeting nei prossimi 7 giorni.</p>
          </div>
        )}

      </div>
    </div>
  )
}
