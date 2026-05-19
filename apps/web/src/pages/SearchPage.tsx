import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { semanticSearch } from '../lib/semanticSearch'
import { embeddingsService } from '../lib/embeddings'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    { meetingId: string; title: string; date: number; score: number; preview: string }[]
  >([])
  const [state, setState] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setState('searching')
    setResults([])
    embeddingsService.init()
    try {
      const res = await semanticSearch(query.trim(), 8)
      setResults(res)
      setState('done')
    } catch {
      setState('error')
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="flex min-h-screen flex-col items-center p-8 gap-6">
      <div className="w-full max-w-xl flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ricerca</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-400 underline"
        >
          Dashboard
        </button>
      </div>

      {/* Search bar */}
      <div className="w-full max-w-xl flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder='Cerca per significato: "accordo con cliente", "decisione budget"…'
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
          autoFocus
        />
        <button
          onClick={handleSearch}
          disabled={state === 'searching' || !query.trim()}
          className="rounded-lg bg-teal-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-teal-800 disabled:opacity-40 transition-colors"
        >
          {state === 'searching' ? '…' : 'Cerca'}
        </button>
      </div>

      {/* Risultati */}
      {state === 'searching' && (
        <p className="text-sm text-gray-400 animate-pulse">Analisi semantica in corso…</p>
      )}

      {state === 'done' && results.length === 0 && (
        <div className="w-full max-w-xl text-center py-8 text-sm text-gray-400">
          Nessun meeting trovato per questa ricerca.
        </div>
      )}

      {state === 'error' && (
        <p className="text-sm text-red-500">Errore durante la ricerca. Riprova.</p>
      )}

      {results.length > 0 && (
        <div className="w-full max-w-xl flex flex-col gap-3">
          <p className="text-xs text-gray-400">{results.length} risultati per "{query}"</p>
          {results.map(r => (
            <button
              key={r.meetingId}
              onClick={() => navigate(`/meeting/${r.meetingId}`)}
              className="w-full text-left rounded-xl border border-gray-200 p-4 hover:border-teal-300 hover:bg-teal-50/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-800">{r.title}</p>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[10px] text-teal-600 bg-teal-50 rounded-full px-2 py-0.5">
                    {Math.round(r.score * 100)}% match
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(r.date)}</span>
                </div>
              </div>
              {r.preview && (
                <p className="text-xs text-gray-500 line-clamp-2">{r.preview}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
