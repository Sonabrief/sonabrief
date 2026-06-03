import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Calendar as CalendarIcon, Pencil, Trash2 } from 'lucide-react'
import { it } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { db, type ActionItem } from '../lib/db'
import { AppNav } from '../components/AppNav'
import i18n from '../i18n'

type Filter = 'all' | 'todo' | 'done'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateLong(ts: number): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
  return `${date} alle ore ${time}`
}

function isFallbackTitle(title: string): boolean {
  return /alle ore|at \d+:\d+/i.test(title)
}

function DeadlineBadge({ item, t }: { item: ActionItem; t: TFunction }) {
  if (!item.dueDate) return null
  const now = Date.now()
  const threeDays = 3 * 24 * 60 * 60 * 1000
  const dateStr = new Date(item.dueDate).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  if (!item.completed && item.dueDate < now) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{t('action_items.expired_label', { date: dateStr })}</span>
  }
  if (!item.completed && item.dueDate <= now + threeDays) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{t('action_items.due_label', { date: dateStr })}</span>
  }
  if (!item.completed) {
    return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{dateStr}</span>
  }
  return <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{dateStr}</span>
}

export default function ActionItemsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<ActionItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState<string>('all')
  const [meetings, setMeetings] = useState<Record<string, { title: string; clientName?: string }>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [openPickerId, setOpenPickerId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'deadline'>('date')

  async function load() {
    const all = await db.action_items.orderBy('createdAt').reverse().toArray()
    setItems(all)
    const allMeetings = await db.meetings.toArray()
    const meetingMap: Record<string, { title: string; clientName?: string }> = {}
    for (const m of allMeetings) meetingMap[m.id] = { title: m.title, clientName: m.clientName }
    setMeetings(meetingMap)
  }

  useEffect(() => { load() }, [])

  async function toggleCompleted(item: ActionItem) {
    await db.action_items.update(item.id, { completed: !item.completed })
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i))
  }

  async function deleteItem(id: string) {
    await db.action_items.delete(id)
    setItems(prev => prev.filter(i => i.id !== id))
    setShowDeleteConfirm(null)
  }

  async function clearCompleted() {
    const completedIds = items.filter(i => i.completed).map(i => i.id)
    await db.action_items.bulkDelete(completedIds)
    setItems(prev => prev.filter(i => !i.completed))
    setShowClearConfirm(false)
  }

  async function saveEdit(item: ActionItem) {
    if (!editingText.trim()) return
    await db.action_items.update(item.id, { text: editingText.trim() })
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, text: editingText.trim() } : i))
    setEditingId(null)
  }

  async function saveDueDate(id: string, dueDate: number | undefined) {
    await db.action_items.update(id, { dueDate })
    setItems(prev => prev.map(i => i.id === id ? { ...i, dueDate } : i))
  }

  async function exportActions() {
    const open = items.filter(i => !i.completed)
    const lines = [t('action_items.export_open_header'), '']
    const grouped: Record<string, typeof open> = {}
    for (const item of open) {
      const key = meetings[item.meetingId]?.title ?? formatDateLong(item.meetingDate)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(item)
    }
    for (const [meetingTitle, actions] of Object.entries(grouped)) {
      lines.push(`## ${meetingTitle}`)
      for (const a of actions) {
        const deadline = a.dueDate ? t('action_items.export_deadline', { date: new Date(a.dueDate).toLocaleDateString(i18n.language) }) : ''
        lines.push(`- [ ] ${a.text}${deadline}`)
      }
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'azioni-aperte.md'; a.click()
    URL.revokeObjectURL(url)
  }

  const clientOptions = useMemo(() => {
    const clients = new Set<string>()
    for (const item of items) {
      const client = meetings[item.meetingId]?.clientName
      if (client) clients.add(client)
    }
    return [...clients].sort()
  }, [items, meetings])

  const filtered = items.filter(item => {
    if (filter === 'todo' && item.completed) return false
    if (filter === 'done' && !item.completed) return false
    if (search.trim() && !item.text.toLowerCase().includes(search.toLowerCase())) return false
    if (filterClient !== 'all' && meetings[item.meetingId]?.clientName !== filterClient) return false
    return true
  })

  const counts = {
    all: items.length,
    todo: items.filter(i => !i.completed).length,
    done: items.filter(i => i.completed).length,
  }

  const filterLabels: Record<Filter, string> = {
    all: t('action_items.filter_all', { count: counts.all }),
    todo: t('action_items.filter_todo', { count: counts.todo }),
    done: t('action_items.filter_done', { count: counts.done }),
  }

  function groupByMeeting(actions: ActionItem[]) {
    const groups: { meetingId: string; meetingTitle: string; meetingDate: number; items: ActionItem[] }[] = []
    for (const item of actions) {
      const existing = groups.find(g => g.meetingId === item.meetingId)
      if (existing) { existing.items.push(item) }
      else {
        groups.push({
          meetingId: item.meetingId,
          meetingTitle: meetings[item.meetingId]?.title ?? formatDateLong(item.meetingDate),
          meetingDate: item.meetingDate,
          items: [item],
        })
      }
    }
    return groups
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
            {t('action_items.title')}
          </h1>
          {counts.todo > 0 && (
            <button
              onClick={exportActions}
              className="text-xs text-primary transition-colors hover:underline motion-reduce:transition-none"
            >
              {t('action_items.export_open')}
            </button>
          )}
        </div>

        {/* Controls */}
        <input
          type="text"
          aria-label={t('action_items.search_aria')}
          placeholder={t('action_items.search_placeholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        />

        <div className="mt-2 flex justify-end">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t('action_items.sort_label')}</span>
            {(['date', 'deadline'] as const).map(s => (
              <button key={s}
                onClick={() => setSortBy(s)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                  sortBy === s
                    ? 'bg-secondary text-primary'
                    : 'border border-border bg-card text-muted-foreground hover:bg-border'
                }`}
              >
                {s === 'date' ? t('action_items.sort_meeting_date') : t('action_items.sort_due_date')}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex gap-2" role="group" aria-label={t('action_items.filter_status_aria')}>
          {(['all', 'todo', 'done'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-muted-foreground hover:bg-border'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {clientOptions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('action_items.filter_client_aria')}>
            <button
              onClick={() => setFilterClient('all')}
              aria-pressed={filterClient === 'all'}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                filterClient === 'all'
                  ? 'bg-secondary text-primary'
                  : 'border border-border bg-card text-muted-foreground hover:bg-border'
              }`}
            >
              {t('action_items.filter_all_clients')}
            </button>
            {clientOptions.map(c => (
              <button
                key={c}
                onClick={() => setFilterClient(c)}
                aria-pressed={filterClient === c}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                  filterClient === c
                    ? 'bg-secondary text-primary'
                    : 'border border-border bg-card text-muted-foreground hover:bg-border'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {counts.done > 0 && (
          <div className="mt-3 flex justify-end">
            {!showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-muted-foreground transition-colors hover:text-destructive motion-reduce:transition-none"
              >
                {t('action_items.clear_completed')}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t('action_items.clear_confirm_msg', { count: counts.done })}</span>
                <button onClick={clearCompleted} className="text-destructive hover:underline">{t('action_items.confirm')}</button>
                <button onClick={() => setShowClearConfirm(false)} className="text-muted-foreground hover:underline">{t('action_items.cancel')}</button>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="mt-5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              {items.length === 0 ? (
                <>
                  <p className="text-sm font-semibold text-foreground">{t('action_items.empty_title')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('action_items.empty_desc')}
                  </p>
                  <button
                    onClick={() => navigate('/recording')}
                    className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
                  >
                    {t('action_items.start_recording')}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">{t('action_items.no_results')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('action_items.no_results_hint')}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groupByMeeting([...filtered].sort((a, b) => {
                if (sortBy === 'deadline') {
                  if (!a.dueDate && !b.dueDate) return 0
                  if (!a.dueDate) return 1
                  if (!b.dueDate) return -1
                  return a.dueDate - b.dueDate
                }
                return b.meetingDate - a.meetingDate
              })).map(group => (
                <div key={group.meetingId}>
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      onClick={() => navigate('/archive', { state: { meetingId: group.meetingId } })}
                      className="text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline motion-reduce:transition-none"
                    >
                      {isFallbackTitle(group.meetingTitle)
                        ? formatDate(group.meetingDate)
                        : group.meetingTitle}
                    </button>
                    {meetings[group.meetingId]?.clientName && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-primary">
                        {meetings[group.meetingId].clientName}
                      </span>
                    )}
                    {!isFallbackTitle(group.meetingTitle) && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{formatDate(group.meetingDate)}</span>
                    )}
                  </div>

                  <ul className="flex flex-col gap-1.5" role="list">
                    {group.items.map((item, i) => (
                      <motion.li
                        key={item.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.14, delay: i * 0.03, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => toggleCompleted(item)}
                            aria-label={t('action_items.toggle_aria', { text: item.text })}
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                          />
                          <div className="min-w-0 flex-1">
                            {editingId === item.id ? (
                              <input
                                type="text"
                                value={editingText}
                                onChange={e => setEditingText(e.target.value)}
                                onBlur={() => saveEdit(item)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveEdit(item)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                autoFocus
                                className="w-full rounded-md border border-primary bg-card px-2 py-0.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              />
                            ) : (
                              <p
                                className={`text-sm ${item.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                                onDoubleClick={() => { setEditingId(item.id); setEditingText(item.text) }}
                              >
                                {item.text}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {item.dueDate ? (
                                <Popover open={openPickerId === item.id} onOpenChange={(open) => setOpenPickerId(open ? item.id : null)}>
                                  <PopoverTrigger className="cursor-pointer" aria-label={t('action_items.edit_due_aria')}>
                                    <DeadlineBadge item={item} t={t} />
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={new Date(item.dueDate)}
                                      onSelect={(date) => {
                                        saveDueDate(item.id, date?.getTime())
                                        setOpenPickerId(null)
                                      }}
                                      locale={it}
                                    />
                                    <button
                                      onClick={() => { saveDueDate(item.id, undefined); setOpenPickerId(null) }}
                                      className="w-full border-t border-border py-1 text-xs text-muted-foreground hover:text-destructive"
                                    >
                                      {t('action_items.remove_due')}
                                    </button>
                                  </PopoverContent>
                                </Popover>
                              ) : null}
                              <span className="text-xs text-muted-foreground">{formatDate(item.meetingDate)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {!item.dueDate && (
                              <Popover open={openPickerId === item.id} onOpenChange={(open) => setOpenPickerId(open ? item.id : null)}>
                                <PopoverTrigger
                                  className="rounded p-1 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 motion-reduce:transition-none"
                                  aria-label={t('action_items.set_due_aria')}
                                >
                                  <CalendarIcon className="h-3.5 w-3.5" />
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                  <Calendar
                                    mode="single"
                                    selected={undefined}
                                    onSelect={(date) => {
                                      saveDueDate(item.id, date?.getTime())
                                      setOpenPickerId(null)
                                    }}
                                    locale={it}
                                  />
                                </PopoverContent>
                              </Popover>
                            )}
                            <button
                              onClick={() => { setEditingId(item.id); setEditingText(item.text) }}
                              className="rounded p-1 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 motion-reduce:transition-none"
                              aria-label={t('action_items.edit_aria')}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(item.id)}
                              className="rounded p-1 text-muted-foreground opacity-40 transition-opacity hover:opacity-100 hover:text-destructive motion-reduce:transition-none"
                              aria-label={t('action_items.delete_aria')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {showDeleteConfirm === item.id && (
                          <div className="mt-1 flex items-center gap-2 pl-8 text-xs">
                            <span className="text-muted-foreground">{t('action_items.delete_confirm')}</span>
                            <button onClick={() => deleteItem(item.id)} className="text-destructive hover:underline">{t('action_items.delete_aria')}</button>
                            <button onClick={() => setShowDeleteConfirm(null)} className="text-muted-foreground hover:underline">{t('action_items.cancel')}</button>
                          </div>
                        )}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
