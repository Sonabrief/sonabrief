import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, type ActionItem } from '../lib/db'

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
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i))
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

  return (
    <div className="min-h-screen bg-[#FAF7F0] px-6 py-10">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1
            className="text-2xl text-[#1A4D52]"
            style={{ fontFamily: '"Instrument Serif", serif' }}
          >
            Action Items
          </h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-gray-400 underline"
          >
            ← Dashboard
          </button>
        </div>

        {/* Ricerca */}
        <input
          type="text"
          placeholder="Cerca action item..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A4D52]/40"
        />

        {/* Filtri */}
        <div className="flex gap-2">
          {(['all', 'todo', 'done'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-[#1A4D52] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {f === 'all' ? `Tutti (${counts.all})` : f === 'todo' ? `Da fare (${counts.todo})` : `Completati (${counts.done})`}
            </button>
          ))}
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-400">
              {items.length === 0
                ? 'Nessun action item ancora. Verranno estratti automaticamente dalle sintesi dei meeting.'
                : 'Nessun risultato per i filtri selezionati.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(item => (
              <div
                key={item.id}
                className={`rounded-xl border bg-white px-5 py-4 flex items-start gap-4 transition-colors ${
                  item.completed ? 'border-gray-100 opacity-60' : 'border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => toggleCompleted(item)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#1A4D52] cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-gray-800 ${item.completed ? 'line-through text-gray-400' : ''}`}>
                    {item.text}
                  </p>
                  <div className="mt-1.5">
                    <button
                      onClick={() => navigate('/archive')}
                      className="text-xs text-[#1A4D52] underline underline-offset-2 hover:text-[#143a3e]"
                    >
                      {formatDate(item.meetingDate)}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
