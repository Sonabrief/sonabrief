import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMeetingBriefing } from '../hooks/useMeetingBriefing'
import { db } from '../lib/db'

function formatRelativeDate(ts: number, t: TFunction): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24))
  if (days === 0) return t('meeting_briefing.today')
  if (days === 1) return t('meeting_briefing.yesterday')
  if (days < 7) return t('meeting_briefing.days_ago', { days })
  if (days < 30) return t('meeting_briefing.weeks_ago', { weeks: Math.floor(days / 7) })
  return t('meeting_briefing.months_ago', { months: Math.floor(days / 30) })
}

export function MeetingBriefing() {
  const { t } = useTranslation()
  const { briefing, loading } = useMeetingBriefing()
  const [panelOpen, setPanelOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
  const [loadingNote, setLoadingNote] = useState(false)

  async function handleMeetingClick(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedNote(null)
      return
    }
    setExpandedId(id)
    setExpandedNote(null)
    setLoadingNote(true)
    const note = await db.notes.where('meetingId').equals(id).first()
    setExpandedNote(note?.content ?? '')
    setLoadingNote(false)
  }

  function collapseNote(e: React.MouseEvent) {
    e.stopPropagation()
    setExpandedId(null)
    setExpandedNote(null)
  }

  const q = search.toLowerCase()
  const filteredMeetings = briefing?.recentMeetings.filter(m =>
    !q || m.title.toLowerCase().includes(q)
  ) ?? []
  const filteredActions = briefing?.openActionItems.filter(a =>
    !q || a.text.toLowerCase().includes(q) || a.meetingTitle.toLowerCase().includes(q)
  ) ?? []

  const totalCount = (briefing?.recentMeetings.length ?? 0) + (briefing?.openActionItems.length ?? 0)

  if (loading) return (
    <div className="animate-pulse rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
      {t('meeting_briefing.loading')}
    </div>
  )

  if (!briefing || totalCount === 0) return (
    <div className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
      {t('meeting_briefing.no_history')}
    </div>
  )

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">

      {/* Header — always visible toggle */}
      <button
        onClick={() => setPanelOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted motion-reduce:transition-none"
        aria-expanded={panelOpen}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{t('meeting_briefing.title')}</span>
          <span className="rounded-full bg-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {t('meeting_briefing.badge', { recent: briefing.recentMeetings.length, open: briefing.openActionItems.length })}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {panelOpen ? t('meeting_briefing.close') : t('meeting_briefing.expand')}
        </span>
      </button>

      {/* Compact preview — top action items, when collapsed */}
      {!panelOpen && briefing.openActionItems.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border px-4 pb-3 pt-2">
          {briefing.openActionItems.slice(0, 3).map(item => (
            <div key={item.id} className="flex items-start gap-2">
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span className="line-clamp-1 text-xs text-foreground">{item.text}</span>
            </div>
          ))}
          {briefing.openActionItems.length > 3 && (
            <span className="pl-3.5 text-xs text-muted-foreground">
              {t('meeting_briefing.more_items', { count: briefing.openActionItems.length - 3 })}
            </span>
          )}
        </div>
      )}

      {/* Expanded panel */}
      {panelOpen && (
        <>
          {/* Search */}
          <div className="border-t border-border px-3 py-2">
            <input
              type="search"
              placeholder={t('meeting_briefing.search_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto border-t border-border" style={{ maxHeight: '320px' }}>

            {/* Action items */}
            {filteredActions.length > 0 && (
              <div className="px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('meeting_briefing.open_actions', { count: filteredActions.length })}
                </p>
                <div className="flex flex-col gap-2">
                  {filteredActions.map(item => (
                    <div key={item.id} className="flex items-start gap-2">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground">{item.text}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.meetingTitle} · {formatRelativeDate(item.meetingDate, t)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Meeting list */}
            {filteredMeetings.length > 0 && (
              <div className={`px-4 py-3 ${filteredActions.length > 0 ? 'border-t border-border' : ''}`}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('meeting_briefing.recent_meetings')}
                </p>
                <div className="flex flex-col gap-1">
                  {filteredMeetings.map(m => (
                    <div key={m.id}>
                      <button
                        onClick={() => handleMeetingClick(m.id)}
                        className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-foreground">{m.title}</p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">
                              {formatRelativeDate(m.date, t)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {expandedId === m.id ? '▲' : '▼'}
                            </span>
                          </div>
                        </div>
                        {expandedId !== m.id && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {m.summary}
                          </p>
                        )}
                      </button>

                      {/* Inline synthesis */}
                      {expandedId === m.id && (
                        <div className="mx-2 mb-1 rounded-md border border-border bg-muted">
                          <div className="max-h-48 overflow-y-auto px-3 pt-3">
                            {loadingNote ? (
                              <p className="animate-pulse text-xs text-muted-foreground">
                                {t('meeting_briefing.loading_synthesis')}
                              </p>
                            ) : expandedNote ? (
                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                                {expandedNote
                                  .replace(/^#+\s*/gm, '')
                                  .replace(/\*\*/g, '')
                                  .trim()}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {t('meeting_briefing.no_synthesis')}
                              </p>
                            )}
                          </div>
                          <div className="px-3 py-2">
                            <button
                              onClick={collapseNote}
                              className="text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                            >
                              {t('meeting_briefing.close_synthesis')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty search state */}
            {filteredMeetings.length === 0 && filteredActions.length === 0 && (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                {t('meeting_briefing.no_search_results', { search })}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
