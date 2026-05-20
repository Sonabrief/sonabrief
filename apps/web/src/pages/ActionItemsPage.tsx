import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type ActionItem } from '../lib/db'
import { AppNav } from '../components/AppNav'

type Filter = 'all' | 'todo' | 'done'

function formatDate(ts: number): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `${date} alle ore ${time}`
}

export default function ActionItemsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ActionItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  async function load() {
    const all = await db.action_items.orderBy('createdAt').reverse().toArray()
    setItems(all)
  }

  useEffect(() => { load() }, [])

  async function toggleCompleted(item: ActionItem) {
    await db.action_items.update(item.id, { completed: !item.completed })
    setItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, completed: !i.completed } : i
    ))
  }

  const filtered = items.filter(item => {
    if (filter === 'todo' && item.completed) return false
    if (filter === 'done' && !item.completed) return false
    if (search.trim() && !item.text.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    all: items.length,
    todo: items.filter(i => !i.completed).length,
    done: items.filter(i => i.completed).length,
  }

  const filterLabels: Record<Filter, string> = {
    all: `Tutti (${counts.all})`,
    todo: `Da fare (${counts.todo})`,
    done: `Completati (${counts.done})`,
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-8 font-heading text-2xl font-bold leading-[1.2] tracking-[-0.015em] text-foreground">
          Azioni
        </h1>

        {/* Controls */}
        <input
          type="text"
          aria-label="Cerca azioni"
          placeholder="Cerca azioni..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        />

        <div
          className="mt-3 flex gap-2"
          role="group"
          aria-label="Filtra per stato"
        >
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

        {/* Content */}
        <div className="mt-5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              {items.length === 0 ? (
                <>
                  <p className="text-sm font-semibold text-foreground">Nessuna azione ancora</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Le azioni vengono estratte automaticamente dalle sintesi dei meeting.
                  </p>
                  <button
                    onClick={() => navigate('/recording')}
                    className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
                  >
                    Avvia registrazione
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground">Nessun risultato</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Prova con un termine diverso o cambia il filtro.
                  </p>
                </>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-2" role="list">
              {filtered.map(item => (
                <li key={item.id}>
                  <div className="flex items-start gap-4 rounded-lg border border-border bg-card px-5 py-4">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleCompleted(item)}
                      aria-label={`Segna come ${item.completed ? 'da fare' : 'completato'}: ${item.text}`}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${item.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {item.text}
                      </p>
                      <div className="mt-1.5">
                        <button
                          onClick={() => navigate('/archive')}
                          aria-label={`Vedi meeting del ${formatDate(item.meetingDate)} nell'archivio`}
                          className="text-xs text-primary transition-colors hover:underline motion-reduce:transition-none"
                        >
                          {formatDate(item.meetingDate)}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
