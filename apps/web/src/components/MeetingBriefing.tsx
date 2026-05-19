import { useState } from 'react'
import { useMeetingBriefing } from '../hooks/useMeetingBriefing'

function formatRelativeDate(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'oggi'
  if (days === 1) return 'ieri'
  if (days < 7) return `${days} giorni fa`
  if (days < 30) return `${Math.floor(days / 7)} sett. fa`
  return `${Math.floor(days / 30)} mesi fa`
}

export function MeetingBriefing() {
  const { briefing, loading } = useMeetingBriefing()
  const [expanded, setExpanded] = useState(false)

  if (loading) return (
    <div className="w-full max-w-xl text-xs text-gray-300 text-center py-2 animate-pulse">
      Caricamento contesto…
    </div>
  )

  if (!briefing || (briefing.recentMeetings.length === 0 && briefing.openActionItems.length === 0)) {
    return (
      <div className="w-full max-w-xl rounded-lg border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-300 text-center">
        Nessun meeting precedente — questo è il tuo primo briefing.
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl rounded-xl border border-teal-100 bg-teal-50/50 overflow-hidden">
      {/* Header sempre visibile */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-teal-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-teal-800">📋 Briefing pre-meeting</span>
          <span className="text-xs text-teal-500 bg-teal-100 rounded-full px-2 py-0.5">
            {briefing.recentMeetings.length} meeting · {briefing.openActionItems.length} azioni aperte
          </span>
        </div>
        <span className="text-teal-400 text-xs">{expanded ? '▲ chiudi' : '▼ espandi'}</span>
      </button>

      {/* Anteprima compatta (sempre visibile) */}
      {!expanded && briefing.openActionItems.length > 0 && (
        <div className="px-4 pb-3 flex flex-col gap-1">
          {briefing.openActionItems.slice(0, 3).map(item => (
            <div key={item.id} className="flex items-start gap-2 text-xs text-teal-700">
              <span className="mt-0.5 text-teal-400">○</span>
              <span className="line-clamp-1">{item.text}</span>
            </div>
          ))}
          {briefing.openActionItems.length > 3 && (
            <span className="text-xs text-teal-400 pl-4">
              +{briefing.openActionItems.length - 3} altri…
            </span>
          )}
        </div>
      )}

      {/* Dettaglio espanso */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-teal-100">
          {briefing.openActionItems.length > 0 && (
            <div className="pt-3">
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">
                Azioni aperte ({briefing.openActionItems.length})
              </p>
              <div className="flex flex-col gap-2">
                {briefing.openActionItems.map(item => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className="text-teal-400 mt-0.5 text-xs">○</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-teal-800">{item.text}</p>
                      <p className="text-[10px] text-teal-400">
                        {item.meetingTitle} · {formatRelativeDate(item.meetingDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {briefing.recentMeetings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">
                Ultimi meeting (90 giorni)
              </p>
              <div className="flex flex-col gap-3">
                {briefing.recentMeetings.map(m => (
                  <div key={m.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-teal-800">{m.title}</p>
                      <span className="text-[10px] text-teal-400 shrink-0 ml-2">
                        {formatRelativeDate(m.date)}
                      </span>
                    </div>
                    <p className="text-[11px] text-teal-600 line-clamp-2">{m.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
